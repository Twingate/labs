import {genFileNameFromNetworkName, loadNetworkAndApiKey, setLastConnectedOnUser} from "../utils/smallUtilFuncs.mjs";
import {TwingateApiClient} from "../TwingateApiClient.mjs";
import {Log} from "../utils/log.js";
import XLSX from "https://cdn.esm.sh/v58/xlsx@0.17.4/deno/xlsx.js";
import {Command} from "https://deno.land/x/cliffy/command/mod.ts";
import {Confirm} from "https://deno.land/x/cliffy/prompt/mod.ts";
import * as Colors from "https://deno.land/std/fmt/colors.ts";

export const removeAllCmd = new Command()
    .description("Remove all (Groups, Resources, Remote Networks")
    .hidden()
    .action(async (options) => {
        const {networkName, apiKey} = await loadNetworkAndApiKey(options.networkName);
        options.networkName = networkName;

        if ( !(await Confirm.prompt(`${Colors.red("THIS WILL DELETE ALL Groups, Resources and Remote Networks in this account.")} Please confirm to continue?`)) ) return;
        let client = new TwingateApiClient(networkName, apiKey);

        const allNodes = await client.fetchAll({
            fieldOpts: {
                defaultObjectFieldSet: [TwingateApiClient.FieldSet.ID]
            },
            typesToFetch: ["Group", "Resource", "RemoteNetwork"]
        });

        const groups = await client.fetchAllGroups({fieldSet: [TwingateApiClient.FieldSet.ID], fieldOpts:{extraFields: ["type"]}});
        for ( const group of groups) {
            if ( group.type === "MANUAL") await client.removeGroup(group.id);
        }

        const resources = await client.fetchAllResources({fieldSet: [TwingateApiClient.FieldSet.ID]});
        for ( const resource of resources) {
            await client.removeResource(resource.id);
        }

        const remoteNetworks = await client.fetchAllRemoteNetworks({fieldSet: [TwingateApiClient.FieldSet.ID]});
        for ( const remoteNetwork of remoteNetworks) {
            await client.removeRemoteNetwork(remoteNetwork.id);
        }

        Log.success(`Remove all completed.`);
    });