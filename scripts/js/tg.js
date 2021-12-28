#!/usr/bin/env -S deno run --allow-all --unstable

import {Command} from "https://deno.land/x/cliffy/command/mod.ts";
import {TwingateApiClient} from "./TwingateApiClient.mjs";
import {Log} from "./utils/log.js";
import {
    exportCmd,
    getTopLevelCommand
} from "./cliCmd/cmd.mjs";
import {importCmd} from "./cliCmd/importCmd.mjs";
import {removeAllCmd} from "./cliCmd/removeAllCmd.mjs";

async function main(args) {

    const topLevelCommands = ["resource", "group", "user", "network", "connector"/*, "device"*/];
    let cmd = new Command()
        .name("tg")
        .version(TwingateApiClient.VERSION)
        .option("-a, --account-name <string>", "Twingate account name", {global: true})
        .description("CLI for Twingate")
        .command("export", exportCmd)
        .command("import", importCmd)
        .command("remove-all", removeAllCmd)

    ;
    for ( const command of topLevelCommands ) cmd = cmd.command(command, getTopLevelCommand(command));
    return await cmd.parse(args);
}

try {
    await main(Deno.args);
} catch (e) {
    Log.exception(e);
}