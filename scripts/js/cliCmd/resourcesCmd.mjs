import {loadNetworkAndApiKey, sortByTextField} from "../utils/smallUtilFuncs.mjs";
import {TwingateApiClient} from "../TwingateApiClient.mjs";
import XLSX from "https://cdn.esm.sh/v58/xlsx@0.17.4/deno/xlsx.js";
import {Table} from "https://deno.land/x/cliffy/table/mod.ts";
import * as Colors from "https://deno.land/std/fmt/colors.ts";

import {Command} from "https://deno.land/x/cliffy/command/mod.ts";

const listCmdConfig = {
    "resource": {
        typeName: "Resource",
        fetchFn: "fetchAllResources",
        listFieldOpts: {
            groups: {
                ignore: true
            }
        }
    },
    "group": {
        typeName: "Group",
        fetchFn: "fetchAllGroups",
        listFieldOpts: {
            users: {ignore: true},
            resources: {ignore: true}
        }
    },
    "user": {
        typeName: "User",
        fetchFn: "fetchAllUsers",
        listFieldOpts: {}
    },
    "network": {
        typeName: "RemoteNetwork",
        fetchFn: "fetchAllRemoteNetworks",
        listFieldOpts: {
            resources: {ignore: true}
        }
    },
    "connector": {
        typeName: "Connector",
        fetchFn: "fetchAllConnectors",
        listFieldOpts: {}
    }
}

function getListCommand(name) {
    let config = listCmdConfig[name];
    return new Command()
        .arguments("")
        .description(`Get list of ${name}s`)
        .action(async (options) => {
            let networkName = null;
            let apiKey = null;
            ({networkName, apiKey} = await loadNetworkAndApiKey());
            let client = new TwingateApiClient(networkName, apiKey);

            const configForCli = {
                defaultConnectionFields: "LABEL_FIELD",
                fieldOpts: {
                    defaultObjectFieldSet: [TwingateApiClient.FieldSet.LABEL],
                    ...config.listFieldOpts
                },
                joinConnectionFields: ", ",
                recordTransformOpts: {
                    mapDateFields: true,
                    mapNodeToLabel: true,
                    mapEnumToDisplay: true,
                    flattenObjectFields: true
                }
            }
            let schema = TwingateApiClient.Schema[config.typeName];
            let records = await client[config.fetchFn](configForCli);
            if (schema.labelField != null) records = sortByTextField(records, schema.labelField);
            let ws = XLSX.utils.json_to_sheet(records);
            let [header, ...recordsArr] = XLSX.utils.sheet_to_json(ws, {raw: false, header: 1});

            let table = new Table()
                .header(header)
                .body(recordsArr)
                .border(true)
                .render()
            ;
        });
}


function getCopyCommand(name) {
    let config = listCmdConfig[name];
    return new Command()
        .arguments("<source:string> <destination:string>")
        .description(`Copy a ${name}`)
        .action(async (options, srcGroup, destGroup) => {
            let networkName = null;
            let apiKey = null;
            ({networkName, apiKey} = await loadNetworkAndApiKey());
            let client = new TwingateApiClient(networkName, apiKey);
            let res = await client.loadCompleteGroup(srcGroup);
            let res2 = await client.createGroup(destGroup, res.resourceIds, res.userIds);
            console.log(Colors.green(`New group named '${destGroup}' created as a copy of '${srcGroup}'`));
        });
}

export function getTopLevelCommand(name) {
    let cmd = new Command()
        .arguments('')
        .description(`Twingate ${name}s`)
        .command("list", getListCommand(name))
    ;
    if ( name == "group" ) {
        cmd = cmd.command("copy", getCopyCommand(name))
    }
    return cmd;
}
