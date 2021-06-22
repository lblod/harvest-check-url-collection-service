import { app, uuid, sparqlEscapeUri, sparqlEscapeString, sparqlEscapeDateTime, errorHandler } from 'mu';
import { querySudo as query, updateSudo as update } from '@lblod/mu-auth-sudo';
import bodyParser from 'body-parser';
import { Delta } from "./lib/delta";

export const TASK_READY = 'http://lblod.data.gift/harvesting-statuses/ready-to-check-urls';

export const TASK_ONGOING = 'http://lblod.data.gift/harvesting-statuses/checking';
export const TASK_SUCCESS = 'http://lblod.data.gift/harvesting-statuses/success';
export const TASK_FAILURE = 'http://lblod.data.gift/harvesting-statuses/failure';
const TARGET_GRAPH = process.env.TARGET_GRAPH || 'http://mu.semte.ch/graphs/public';

app.use(bodyParser.json({
  type: function (req) {
    return /^application\/json/.test(req.get('content-type'));
  }
}));
app.get('/', function (req, res) {
  res.send('Hello mu-javascript-template');
});

app.post("/delta", async (req, res, next) => {
  try {
    const tasks = new Delta(req.body).getInsertsFor('http://www.w3.org/ns/adms#status', TASK_READY);
    if (!tasks.length) {
      console.log('Delta dit not contain harvesting-tasks that are ready for import, awaiting the next batch!');
      return res.status(204).send();
    }
    console.log(`Starting import for harvesting-tasks: ${tasks.join(`, `)}`);
    for (let task of tasks) {
      try {
        await updateTaskStatus(task, TASK_ONGOING);
        //await importHarvestingTask(task);
        const result = await getFailedDownloadUrl(task);
        if (!result.length) {
          await updateTaskStatus(task, TASK_SUCCESS);
        } else {
          console.log(JSON.stringify(result));
          await updateTaskStatus(task, TASK_FAILURE);
        }
      } catch (e) {
        console.log(`Something unexpected went wrong while handling delta harvesting-task <${task}>`);
        console.error(e);
        try {
          await updateTaskStatus(task, TASK_FAILURE);
        } catch (e) {
          console.log(`Failed to update state of task <${task}> to failure state. Is the connection to the database broken?`);
          console.error(e);
        }
      }
    }
    return res.status(200).send().end();
  } catch (e) {
    console.log(`Something unexpected went wrong while handling delta harvesting-tasks!`);
    console.error(e);
    return next(e);
  }
});



async function getFailedDownloadUrl(taskUri) {
  const q = `
      PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX task: <http://redpencil.data.gift/vocabularies/tasks/>
    PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
    select distinct  ?url WHERE {
    ${sparqlEscapeUri(taskUri)} <http://purl.org/dc/terms/isPartOf> ?job;
          task:inputContainer ?container.
    ?container task:hasHarvestingCollection ?collection.
    ?collection dct:hasPart ?remoteDataObjects.
    ?remoteDataObjects  <http://www.w3.org/ns/adms#status> ?status.
    ?remoteDataObjects nie:url ?url.
    filter (?status NOT in (<http://lblod.data.gift/file-download-statuses/collected>))
    }
  
  `;
  const result = await query(q);
  return result.results.bindings;
}

export async function updateTaskStatus(uri, status) {
  const q = `
    PREFIX melding: <http://lblod.data.gift/vocabularies/automatische-melding/>
    PREFIX adms: <http://www.w3.org/ns/adms#>
    DELETE {
      GRAPH ?g {
        ${sparqlEscapeUri(uri)} adms:status ?status .
      }
    } WHERE {
      GRAPH ?g {
        ${sparqlEscapeUri(uri)} adms:status ?status .
      }
    }
    ;
    INSERT {
      GRAPH ?g {
        ${sparqlEscapeUri(uri)} adms:status ${sparqlEscapeUri(status)} .
      }
    } WHERE {
      GRAPH ?g {
        ${sparqlEscapeUri(uri)} a melding:HarvestingTask .
      }
    }
  `;

  await update(q);
}

app.use(errorHandler);
