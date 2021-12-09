/**
 * A place for small util funcs. Some may get moved to a different location later
 */
import * as Colors from "https://deno.land/std/fmt/colors.ts";
import {
    Input as InputPrompt, prompt,
    Secret as SecretPrompt,
    Toggle as TogglePrompt
} from "https://deno.land/x/cliffy/prompt/mod.ts";
import {TwingateApiClient} from "../TwingateApiClient.mjs";
import {exists as fileExists} from "https://deno.land/std/fs/mod.ts";
import {decryptData, encryptData} from "../crypto.mjs";

export function genFileNameFromNetworkName(networkName, extension = "xlsx") {
    const
        d = new Date(),
        date = d.toISOString().split('T')[0],
        time = (d.toTimeString().split(' ')[0]).replaceAll(":", "-");
    return `${networkName}-${date}_${time}.${extension}`;
}


export async function loadNetworkAndApiKey(networkName = null) {
    let apiKey = null, saveConfig = false, availableNetworks = [];
    const
        keyFile = ".tgkeys",
        keyFilePath = `./${keyFile}`,
        networkNamePrompt = {
            name: "networkName", message: `Enter Twingate network name:`,
            hint: `For example, '${Colors.red("acme")}' for '${Colors.red("acme")}.twingate.com'`, type: InputPrompt,
            suggestions: availableNetworks,
            validate: async (networkName) => ((await TwingateApiClient.testNetworkValid(networkName)) ? true : `Network not found: '${networkName}'.`)
        },
        apiKeyPrompt = {name: "apiKey", message: `Enter API key:`, type: SecretPrompt},
        saveConfigConfirmation = {
            name: "saveConfig", message: `Save network and API key to file?`,
            hint: `Will be saved to '${Colors.yellow(keyFile)}'.`, type: TogglePrompt
        }
    ;

    try {
        if (false === await fileExists(keyFilePath)) throw new Error("Keyfile does not exist");
        let confFileData = await decryptData(await Deno.readFile(keyFilePath));
        let keyConf = JSON.parse(confFileData);
        networkName = networkName || keyConf["networkName"];
        // TODO fix case of no network name + multiple apiKeys
        if ( typeof keyConf.apiKeys === "object" ) availableNetworks.push(...Object.keys(keyConf.apiKeys));
        if (networkName == null) throw new Error("Network missing");
        let apiKey = keyConf.apiKeys[networkName];
        if (apiKey == null) throw new Error("API key missing in config.");
        return {networkName, apiKey};
    } catch (e) {
        if ( networkName != null ) networkNamePrompt.default = networkName;
        ({networkName} = await prompt([networkNamePrompt]));
        ({apiKey} = await prompt([{ ...apiKeyPrompt,
            validate: async (apiKey) => ((await TwingateApiClient.testApiKeyValid(networkName, apiKey)) ? true : `API key not valid.`)
        }]));
        ({saveConfig} = await prompt([saveConfigConfirmation]));

        if (saveConfig === true) {
            let keyConf = {
                networkName,
                apiKeys: {
                    [networkName]: apiKey
                },
                _version: TwingateApiClient.VERSION
            }
            await Deno.writeFile(keyFilePath, await encryptData(JSON.stringify(keyConf)), {mode: 0o600});
            console.info("Configuration file saved.");
        }
        return {networkName, apiKey};
    }
}

export function sortByTextField(arr, prop, defaultVal = "") {
    return arr.sort((a,b) => (a[prop]||defaultVal).localeCompare(b[prop]||defaultVal));
}
export function setLastConnectedOnUser(nodeObj) {
    if ( !nodeObj.Device || !nodeObj.User ) return;
    const MIN_DATE = new Date(-8640000000000000);
    const lastConnectedMap = new Map();
    nodeObj.Device
        .filter(d => d.lastConnectedAt != null)
        .forEach(d => d.lastConnectedAt = new Date(d.lastConnectedAt))
    ;
    let devices = nodeObj.Device.sort((a, b) => {
        a = a.lastConnectedAt || MIN_DATE;
        b = b.lastConnectedAt || MIN_DATE;
        return b.getTime() - a.getTime();
    });
    devices.forEach((d) => {
        if (!lastConnectedMap.has(d.userLabel)) lastConnectedMap.set(d.userLabel, d.lastConnectedAt)
    });

    for (const user of nodeObj.User) user.lastConnectedAt = lastConnectedMap.get(user.email);
}