import { sparqlEscapeUri, uuid, sparqlEscapeString, sparqlEscapeDateTime, sparqlEscapeInt } from 'mu';
import fs from 'fs-extra';
import { updateSudo as update } from '@lblod/mu-auth-sudo';


export async function writeFile(graph, content, logicalFileName, contentType="text/plain", extension="txt") {
    const phyId = uuid();
    const phyFilename = `${phyId}.${extension}`;
    const path = `/share/${phyFilename}`;
    const physicalFile = path.replace('/share/', 'share://');
    const loId = uuid();
    const logicalFile = `http://data.lblod.info/id/files/${loId}`;
    const now = new Date();

    try {
        await fs.writeFile(path, content, 'utf-8');
    } catch (e) {
        console.log(`Failed to write TTL to file <${physicalFile}>.`);
        throw e;
    }

    try {
        const stats = await fs.stat(path);
        const fileSize = stats.size;

        await update(`
      PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
      PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
      PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
      PREFIX dct: <http://purl.org/dc/terms/>
      PREFIX dbpedia: <http://dbpedia.org/ontology/>
      INSERT DATA {
        GRAPH ${sparqlEscapeUri(graph)} {
          ${sparqlEscapeUri(physicalFile)} a nfo:FileDataObject;
                                  nie:dataSource ${sparqlEscapeUri(logicalFile)} ;
                                  mu:uuid ${sparqlEscapeString(phyId)};
                                  nfo:fileName ${sparqlEscapeString(phyFilename)} ;
                                  dct:creator <http://lblod.data.gift/services/harvesting-import-service>;
                                  dct:created ${sparqlEscapeDateTime(now)};
                                  dct:modified ${sparqlEscapeDateTime(now)};
                                  dct:format "${contentType}";
                                  nfo:fileSize ${sparqlEscapeInt(fileSize)};
                                  dbpedia:fileExtension "${extension}".
          ${sparqlEscapeUri(logicalFile)} a nfo:FileDataObject;
                                  mu:uuid ${sparqlEscapeString(loId)};
                                  nfo:fileName ${sparqlEscapeString(logicalFileName)} ;
                                  dct:creator <http://lblod.data.gift/services/harvesting-import-service>;
                                  dct:created ${sparqlEscapeDateTime(now)};
                                  dct:modified ${sparqlEscapeDateTime(now)};
                                  dct:format "${contentType}";
                                  nfo:fileSize ${sparqlEscapeInt(fileSize)};
                                  dbpedia:fileExtension "${extension}" .
        }
      }
`);

    } catch (e) {
        console.log(`Failed to write resource <${logicalFile}> to triplestore.`);
        throw e;
    }

    return logicalFile;
}