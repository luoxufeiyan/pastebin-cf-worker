import { execSync } from 'child_process';
import { writeFileSync, readFileSync } from 'fs';

const BASE_URL = 'https://paste.fledding.com';
const BINDING = 'PB';

// Read keywords from wrangler.toml
let KEYWORD = [];
try {
    const tomlContent = readFileSync('wrangler.toml', 'utf-8');
    const match = tomlContent.match(/BLOCKED_KEYWORDS\s*=\s*(['"])(.*?)\1/);
    if (match && match[2]) {
        KEYWORD = match[2].split(',');
    }
} catch (e) {
    console.warn("Could not read BLOCKED_KEYWORDS from wrangler.toml", e.message);
}

console.log('Fetching KV keys using Wrangler...');

let keysRaw = '';
try {
    // First attempt: list directly on the binding
    keysRaw = execSync(`npx wrangler kv:key list --binding ${BINDING}`).toString();
} catch (e) {
    try {
        // Second attempt: using namespace ID
        keysRaw = execSync(`npx wrangler kv:key list --namespace-id 5bcf0c8f50054bf0bae1d294d5b558ff`).toString();
    } catch (err) {
        console.error("Error: Failed to fetch KV keys using Wrangler CLI.");
        console.error(err.message);
        process.exit(1);
    }
}

const jsonStart = keysRaw.indexOf('[');
if (jsonStart !== -1) {
    keysRaw = keysRaw.substring(jsonStart);
}

const keys = JSON.parse(keysRaw);
console.log(`Successfully fetched ${keys.length} keys from Cloudflare.`);

const spamKeys = [];

async function checkSpam() {
    console.log(`Checking ${keys.length} keys for spam content...`);
    let count = 0;

    // Checking in parallel pairs of 10 for performance
    const limit = 10;
    for (let i = 0; i < keys.length; i += limit) {
        const chunk = keys.slice(i, i + limit);

        await Promise.all(chunk.map(async (keyObj) => {
            const name = keyObj.name;
            count++;

            // Skip admin password records, but allow checking ~ string routes
            if (name.includes(':')) return;

            try {
                const res = await fetch(`${BASE_URL}/${name}?mime=text/plain`);
                if (res.ok) {
                    const content = (await res.text()).toLowerCase();
                    const isSpam = Array.isArray(KEYWORD)
                        ? KEYWORD.some(kw => content.includes(kw.toLowerCase()))
                        : content.includes(KEYWORD.toLowerCase());

                    if (isSpam) {
                        spamKeys.push(name);
                        console.log(`[x] Spam detected: ${name}`);
                    }
                }
            } catch (e) {
                console.warn(`[!] Error fetching ${name}: ${e.message}`);
            }
        }));

        if (count % 50 === 0 || count === keys.length) {
            console.log(`Progress: Checked ${count} / ${keys.length} keys...`);
        }
    }

    if (spamKeys.length > 0) {
        console.log(`\nScan complete! Found ${spamKeys.length} matching spam pastes.`);
        console.log(`Saving keys to 'spam_keys_to_delete.json'...`);

        // Write just the names of the keys to bulk_delete
        writeFileSync('spam_keys_to_delete.json', JSON.stringify(spamKeys, null, 2));

        console.log('\nYou can now bulk delete them by running this command in your terminal:');
        console.log(`npx wrangler kv:bulk delete --binding ${BINDING} spam_keys_to_delete.json`);

        // Cloudflare limits list API to 1000 items at a time without cursors, 
        // so user may run this tool several times if there are > 1000 items.
        if (keys.length === 1000) {
            console.log("\nNote: Only the first 1000 keys were checked. Rerun this script after deleting to fetch the next batch.");
        }
    } else {
        console.log('\nScan complete! No spam pastes found.');
    }
}

checkSpam();
