const fs=require("fs");
const assert=require("assert");

const required=[
  "index.html","app.js","styles.css","public-data.js","rest-rules.js",
  "effects-rules.js","armor-class.js","manifest.webmanifest","sw.js",
  "icon.svg","icon-180.png","icon-192.png","icon-512.png","LEGAL.html","robots.txt"
];
for(const file of required) assert(fs.existsSync(file),`Missing public file: ${file}`);

const forbidden=[
  "aurora-data.js","aurora-resources.js","aurora-freecasts.js",
  "aurora-items.js","aurora-companions.js","aurora-class-companions.js"
];
for(const file of forbidden) assert(!fs.existsSync(file),`Private database included: ${file}`);

const html=fs.readFileSync("index.html","utf8");
const sw=fs.readFileSync("sw.js","utf8");
const legal=fs.readFileSync("LEGAL.html","utf8");
const publicData=fs.readFileSync("public-data.js","utf8");
assert(html.includes('name="robots" content="noindex'),"noindex is missing");
assert(html.includes('src="public-data.js"'),"public compatibility data is missing");
for(const file of forbidden){
  assert(!html.includes(`src="${file}"`),`index loads ${file}`);
  assert(!sw.includes(`./${file}`),`service worker caches ${file}`);
}
assert(legal.includes("System Reference Document 5.2.1"),"SRD attribution is missing");
assert(legal.includes("creativecommons.org/licenses/by/4.0/legalcode"),"CC BY 4.0 link is missing");
for(const assignment of [
  "window.AURORA_SPELLS={};","window.AURORA_RESOURCE_DEFS={};",
  "window.AURORA_COMPANIONS={};"
]) assert(publicData.includes(assignment),`Public stub is not empty: ${assignment}`);
assert(publicData.includes('"ID_WOTC_PHB24_CLASS_WARLOCK":8'),"Public hit-die mechanics are missing");
assert(publicData.includes('"PHB","PHB24"'),"Public armour mechanics are missing");
for(const phrase of ["Player’s Handbook (2024)","Dungeon Master’s Guide (2024)","Monster Manual (2025)"]){
  for(const file of ["public-data.js","index.html","sw.js"]){
    assert(!fs.readFileSync(file,"utf8").includes(phrase),`${phrase} data marker found in ${file}`);
  }
}
console.log("Public web package validation passed.");
