import { app, uuid, sparqlEscapeUri, sparqlEscapeString, sparqlEscapeDateTime, errorHandler } from 'mu';
import { querySudo as query, updateSudo as update } from '@lblod/mu-auth-sudo';
import bodyParser from 'body-parser';
import { Delta } from "./lib/delta";
import { parseResult } from "./lib/utils";
import { isTask, loadTask, updateTaskStatus, appendTaskError, appendTaskResultGraph } from './lib/task';
import {
  STATUS_SCHEDULED,
  TASK_HARVESTING_CHECKING_URLS,
  STATUS_BUSY,
  STATUS_FAILED,
  STATUS_SUCCESS,
  PREFIXES
} from './constants';
import flatten from 'lodash.flatten';

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
    const entries = new Delta(req.body).getInsertsFor('http://www.w3.org/ns/adms#status', STATUS_SCHEDULED);
    if (!entries.length) {
      console.log('Delta dit not contain potential tasks that are checking urls, awaiting the next batch!');
      return res.status(204).send();
    }
    for (let entry of entries) {
      try {
        console.log(entry);
        if (! await isTask(entry)) continue;
        const task = await loadTask(entry);
        if (isCheckingUrlTask(task)) {
          await runCheckingUrlPipeline(task);
        }

      } catch (e) {
        console.log(`Something unexpected went wrong while handling delta task!`);
        console.error(e);
        return next(e);
      }
    }
    return res.status(200).send().end();
  } catch (e) {
    console.log(`Something unexpected went wrong while handling delta harvesting-tasks!`);
    console.error(e);
    return next(e);
  }
});

function isCheckingUrlTask(task) {
  return task.operation == TASK_HARVESTING_CHECKING_URLS;
}

async function getFailedDownloadUrl(task) {
  const q = `
      PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX task: <http://redpencil.data.gift/vocabularies/tasks/>
    PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
    select distinct  ?url WHERE {
    ${sparqlEscapeUri(task.task)} <http://purl.org/dc/terms/isPartOf> ?job.
    ?task <http://purl.org/dc/terms/isPartOf> ?job;
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

async function runCheckingUrlPipeline(task) {
  await updateTaskStatus(task, STATUS_BUSY);
  const result = await getFailedDownloadUrl(task);
 
  if (result && result.length) {
    const msgs = flatten(result.map(r => r.url.value));
    appendTaskError(task, "The following urls could not be downloaded: " + msgs.join(', '));
    await await updateTaskStatus(task, STATUS_FAILED);
  } else {
    await updateTaskStatus(task, STATUS_SUCCESS);
  }
  await appendInputContainerToResultGraph(task);
}

async function appendInputContainerToResultGraph(task){
  const queryGraph = `
     ${PREFIXES}
     SELECT DISTINCT ?graph WHERE {
        GRAPH ?g {
          BIND(${sparqlEscapeUri(task.task)} as ?task).
          ?task task:inputContainer ?container.
          ?container task:hasGraph ?graph.
        }
     }
  `;
  const graphData = parseResult(await query(queryGraph))[0];
  const graphContainer = { id: uuid() };
  graphContainer.uri = `http://redpencil.data.gift/id/dataContainers/${graphContainer.id}`;
  await appendTaskResultGraph(task, graphContainer, graphData.graph);
  
}

app.use(errorHandler);
