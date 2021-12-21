import {genFileNameFromNetworkName, loadNetworkAndApiKey, setLastConnectedOnUser} from "../utils/smallUtilFuncs.mjs";
import {TwingateApiClient} from "../TwingateApiClient.mjs";
import {Log} from "../utils/log.js";
import XLSX from "https://cdn.esm.sh/v58/xlsx@0.17.4/deno/xlsx.js";
import {Command} from "https://deno.land/x/cliffy/command/mod.ts";
import {Confirm} from "https://deno.land/x/cliffy/prompt/mod.ts";

async function importExcel(client, options) {
    const configForExport = {
        defaultConnectionFields: "LABEL_FIELD",
        fieldOpts: {
            defaultObjectFieldSet: [TwingateApiClient.FieldSet.LABEL]
        },
        joinConnectionFields: ", ",
        recordTransformOpts: {
            mapDateFields: true,
            mapNodeToLabel: true,
            mapEnumToDisplay: true,
            flattenObjectFields: true
        }
    }
    const allNodes = await client.fetchAll(configForExport);

    setLastConnectedOnUser(allNodes);
    let wb = XLSX.utils.book_new();
    for (const [typeName, records] of Object.entries(allNodes)) {
        //if ( typeName !== "RemoteNetwork") continue;
        let ws = XLSX.utils.json_to_sheet(records);
        ws['!autofilter'] = {ref: ws["!ref"]};
        XLSX.utils.book_append_sheet(wb, ws, typeName);
    }
    options.outputFile = options.outputFile || genFileNameFromNetworkName(options.networkName);
    await Deno.writeFile(`./${options.outputFile}`, new Uint8Array(XLSX.write(wb, {type: "array"})));
}

export const importCmd = new Command()
    .option("-f, --file [string]", "Path to Excel file to import from")
    .option("-n, --remote-networks", "Import Remote Networks")
    .option("-r, --resources", "Import Resources")
    .description("Import from excel file to a Twingate account")
    .action(async (options) => {
        console.warn("boo")
        const {networkName, apiKey} = await loadNetworkAndApiKey(options.networkName);
        options.networkName = networkName;
        let client = new TwingateApiClient(networkName, apiKey);

        let fileData = await Deno.readFile("./monabriventures-2021-12-20_16-28-33.xlsx");
        let wb = XLSX.read(fileData,{type:'array', cellDates: true});
        let sheetNames = wb.SheetNames;
        let typesToFetch = [];
        let optionToSheetMap = {
            remoteNetworks: "RemoteNetwork",
            resources: "Resource"
        }

        for (const [optionName, schemaName ] of Object.entries(optionToSheetMap) ) {
            // TODO: For now we import everything
            options[optionName] = true;

            if ( options[optionName] === true ) {
                if ( !sheetNames.includes(schemaName) ) {
                    Log.error(`Cannot import remote networks because the Excel file is missing a sheet named '${schemaName}`);
                    return;
                }
                typesToFetch.push(schemaName);
            }
        }

        if ( typesToFetch.length === 0 ) {
            Log.error(`Nothing to import.`);
            return;
        }

        let nodeLabelIdMap = {
            RemoteNetwork: {},
            Resource: {}
        }
        const allNodes = await client.fetchAll({
            fieldOpts: {
                defaultObjectFieldSet: [TwingateApiClient.FieldSet.LABEL, TwingateApiClient.FieldSet.ID]
            },
            typesToFetch
        });
        allNodes.RemoteNetwork = allNodes.RemoteNetwork || [];
        allNodes.Resource = allNodes.Resource || [];

        let remoteNetworksById = {};
        for ( let node of allNodes.RemoteNetwork ) remoteNetworksById[node.id] = node;

        let resourcesById = {};
        for ( let node of allNodes.Resource ) resourcesById[node.id] = node;


        for ( let node of allNodes.RemoteNetwork) {
            if ( nodeLabelIdMap.RemoteNetwork[node.name] != null ) {
                Log.error(`Remote Network with duplicate name found: '${node.name}' - Ids: ['${nodeLabelIdMap.RemoteNetwork[node.name]}', '${node.id}']`);
                return;
            }
            node.resourceNames = node.resources.map( resourceId => resourcesById[resourceId].name );
            node.resources = node.resources.map( resourceId => resourcesById[resourceId] );
            if ( node.resourceNames.length !== (new Set(node.resourceNames)).size ) {
                Log.error(`Remote network '${node.name}' contains resources with duplicate names`);
                return;
            }
            nodeLabelIdMap.RemoteNetwork[node.name] = node.id;
        }

        for ( let node of allNodes.Resource) {
            node.remoteNetwork = remoteNetworksById[node.remoteNetwork.id].name;
        }

        // Map of old id to new id
        let mergeMap = {};
        for ( let schemaName of typesToFetch ) {
            let sheetData = XLSX.utils.sheet_to_json(wb.Sheets[schemaName]);
            mergeMap[schemaName] = sheetData;
            switch (schemaName) {
                case "RemoteNetwork":
                    for ( let remoteNetworkRow of sheetData) {
                        // 1. Check if network exists
                        let existingId = nodeLabelIdMap.RemoteNetwork[remoteNetworkRow.name];
                        if ( existingId != null ) {
                            Log.info(`Remote Network with same name already exists, will skip: '${remoteNetworkRow.name}'`);
                            remoteNetworkRow["importAction"] = "SKIP";
                            remoteNetworkRow["importId"] = existingId;
                        }
                        else {
                            Log.info(`Remote Network will be created: '${remoteNetworkRow.name}'`);
                            remoteNetworkRow["importAction"] = "CREATE";
                            remoteNetworkRow["importId"] = null;
                        }
                    }
                    break;
                case "Resource":
                    for ( let resourceRow of sheetData ) {
                        let existingRemoteNetwork = remoteNetworksById[nodeLabelIdMap.RemoteNetwork[resourceRow.remoteNetworkLabel]];
                        if ( existingRemoteNetwork != null && existingRemoteNetwork.resourceNames.includes(resourceRow.name) ) {
                            Log.info(`Resource with same name exists, will skip: '${resourceRow.name}' in Remote Network '${resourceRow.remoteNetworkLabel}'`);
                            resourceRow["importAction"] = "SKIP";
                            resourceRow["importId"] = existingRemoteNetwork.resources.filter(r => r.name === resourceRow.name)[0];
                        }
                        else {
                            Log.info(`Resource will be created: '${resourceRow.name}' in Remote Network '${resourceRow.remoteNetworkLabel}'`);
                            resourceRow["importAction"] = "CREATE";
                            resourceRow["importId"] = null;
                        }
                    }
                    break;
                default:
                    // NoOp
                    break;
            }
        }

        for ( const [schemaName, importData] of Object.entries(mergeMap)) {
            const recordsToImport = importData.filter(row => row.importAction === "CREATE");
            Log.info(`Importing ${recordsToImport.length} record(s) as ${schemaName}s`);
        }

        //await importExcel(client, options);
        Log.success(`Import to '${networkName}' completed.`);
    });