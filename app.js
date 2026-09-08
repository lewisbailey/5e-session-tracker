
const STORAGE_KEY = "dnd-session-tracker-v1";
const PUBLIC_EDITION = !!window.PUBLIC_EDITION;

const defaultCharacter = (name="New Character") => ({
  id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()+Math.random()),
  name,
  hp: { current: 10, max: 10, temp: 0 },
  inspiration: false,
  death: { success: 0, failure: 0 },
  spellSlots: Object.fromEntries(Array.from({length:9},(_,i)=>[i+1,{used:0,max:0}])),
  hitDice: [{ die:"d8", used:0, max:1 }],
  currency: {cp:0,sp:0,ep:0,gp:0,pp:0},
  resources: [],
  inventory: [],
  journalNotes: [],
  activeEffects: [],
  favouriteActions: [],
  aurora: null
});

const defaultEncounter = () => ({
  round: 1,
  currentId: null,
  combatants: [],
  turnStarted: false
});

const ENCOUNTER_CONDITIONS = [
  "Blinded","Charmed","Deafened","Exhaustion","Frightened","Grappled","Incapacitated",
  "Invisible","Paralyzed","Petrified","Poisoned","Prone","Restrained",
  "Stunned","Unconscious"
];


const JOURNAL_NOTE_TYPES={
  identity:"Person / Identity",
  npc:"NPC",
  location:"Location",
  quest:"Quest",
  clue:"Clue",
  general:"General"
};
const TRACKER_NOTES_START="=== D&D Session Tracker Notes v1 ===";
const TRACKER_NOTES_END="=== End D&D Session Tracker Notes ===";

function normalizeJournalNote(note={}){
  const type=Object.prototype.hasOwnProperty.call(JOURNAL_NOTE_TYPES,note.type)?note.type:"general";
  return {
    id:note.id||newUuid(),
    type,
    title:String(note.title||"Untitled Note"),
    tags:Array.isArray(note.tags)?note.tags.map(x=>String(x).trim()).filter(Boolean):String(note.tags||"").split(",").map(x=>x.trim()).filter(Boolean),
    pinned:!!note.pinned,
    canImpersonate:type==="identity"&&!!note.canImpersonate,
    appearance:type==="identity"?String(note.appearance||""):"",
    voice:type==="identity"?String(note.voice||""):"",
    body:String(note.body||""),
    updatedAt:note.updatedAt||new Date().toISOString()
  };
}
function journalNoteComparable(note){
  const n=normalizeJournalNote(note);
  return {type:n.type,title:n.title,tags:n.tags,pinned:n.pinned,canImpersonate:n.canImpersonate,appearance:n.appearance,voice:n.voice,body:n.body};
}
function journalNotesEqual(a,b){
  const aa=(a||[]).map(journalNoteComparable);
  const bb=(b||[]).map(journalNoteComparable);
  return JSON.stringify(aa)===JSON.stringify(bb);
}
function noteSafeSingleLine(value=""){
  return String(value).replace(/[\r\n]+/g," ").trim();
}
function escapeTrackerNoteBody(value=""){
  const reserved=/^(?:## |Pinned:|Updated:|Can Impersonate:|Tags:|Appearance:|Voice \/ Mannerisms:|Notes:|-- End Note --|===)/;
  return String(value).replace(/\r\n?/g,"\n").split("\n").map(line=>reserved.test(line)?"\\"+line:line).join("\n");
}
function unescapeTrackerNoteBody(value=""){
  return String(value).split("\n").map(line=>line.startsWith("\\")?line.slice(1):line).join("\n");
}
function serializeJournalNotes(notes){
  const lines=[TRACKER_NOTES_START,"","These notes are maintained by D&D Session Tracker and can be edited in either app.",""];
  for(const raw of (notes||[])){
    const n=normalizeJournalNote(raw);
    const label=JOURNAL_NOTE_TYPES[n.type]||"General";
    lines.push(`## ${label}: ${noteSafeSingleLine(n.title)}`);
    lines.push(`Pinned: ${n.pinned?"Yes":"No"}`);
    lines.push(`Updated: ${n.updatedAt||new Date().toISOString()}`);
    if(n.type==="identity") lines.push(`Can Impersonate: ${n.canImpersonate?"Yes":"No"}`);
    lines.push(`Tags: ${n.tags.join(", ")}`);
    if(n.type==="identity"){
      lines.push("Appearance:");
      lines.push(escapeTrackerNoteBody(n.appearance));
      lines.push("Voice / Mannerisms:");
      lines.push(escapeTrackerNoteBody(n.voice));
    }
    lines.push("Notes:");
    lines.push(escapeTrackerNoteBody(n.body));
    lines.push("-- End Note --","");
  }
  lines.push(TRACKER_NOTES_END);
  return lines.join("\n");
}
function noteTypeFromLabel(label=""){
  const x=String(label).trim().toLowerCase();
  if(x==="person / identity"||x==="identity"||x==="person") return "identity";
  if(x==="npc") return "npc";
  if(x==="location") return "location";
  if(x==="quest") return "quest";
  if(x==="clue") return "clue";
  return "general";
}
function parseTrackerNotesText(text=""){
  const source=String(text||"");
  const start=source.indexOf(TRACKER_NOTES_START);
  if(start<0) return [];
  const end=source.indexOf(TRACKER_NOTES_END,start+TRACKER_NOTES_START.length);
  if(end<0) return [];
  const inner=source.slice(start+TRACKER_NOTES_START.length,end).replace(/\r\n?/g,"\n");
  const lines=inner.split("\n");
  const out=[];
  let note=null, field=null, buffer=[];
  const flushField=()=>{
    if(!note||!field) return;
    note[field]=unescapeTrackerNoteBody(buffer.join("\n").replace(/^\n+|\n+$/g,""));
    field=null; buffer=[];
  };
  const finish=()=>{
    if(!note) return;
    flushField();
    out.push(normalizeJournalNote(note));
    note=null; field=null; buffer=[];
  };
  for(const line of lines){
    const header=line.match(/^## (.+?): (.*)$/);
    if(header){
      finish();
      note={id:newUuid(),type:noteTypeFromLabel(header[1]),title:header[2]||"Untitled Note",tags:[],pinned:false,canImpersonate:false,appearance:"",voice:"",body:"",updatedAt:new Date().toISOString()};
      continue;
    }
    if(!note) continue;
    if(line==="-- End Note --"){ finish(); continue; }
    if(line.startsWith("\\")){ if(field) buffer.push(line); continue; }
    if(/^Pinned:\s*/.test(line)){ flushField(); note.pinned=/yes/i.test(line.replace(/^Pinned:\s*/,"")); continue; }
    if(/^Updated:\s*/.test(line)){ flushField(); note.updatedAt=line.replace(/^Updated:\s*/,"").trim()||note.updatedAt; continue; }
    if(/^Can Impersonate:\s*/.test(line)){ flushField(); note.canImpersonate=/yes/i.test(line.replace(/^Can Impersonate:\s*/,"")); continue; }
    if(/^Tags:\s*/.test(line)){ flushField(); note.tags=line.replace(/^Tags:\s*/,"").split(",").map(x=>x.trim()).filter(Boolean); continue; }
    if(line==="Appearance:"){ flushField(); field="appearance"; buffer=[]; continue; }
    if(line==="Voice / Mannerisms:"){ flushField(); field="voice"; buffer=[]; continue; }
    if(line==="Notes:"){ flushField(); field="body"; buffer=[]; continue; }
    if(field) buffer.push(line);
  }
  finish();
  return out;
}
function parseAuroraJournalNotes(doc){
  const noteNodes=[...(doc.querySelectorAll("build > input > notes > note")||[])];
  for(const node of noteNodes){
    const parsed=parseTrackerNotesText(node.textContent||"");
    if(parsed.length || (node.textContent||"").includes(TRACKER_NOTES_START)) return parsed;
  }
  return [];
}

function normalizeAppState(s){
  if(!s || typeof s!=="object") s={};
  if(!Array.isArray(s.characters)) s.characters=[];
  if(!Array.isArray(s.companions)) s.companions=[];
  if(!s.encounter || typeof s.encounter!=="object") s.encounter=defaultEncounter();
  if(!Array.isArray(s.encounter.combatants)) s.encounter.combatants=[];
  if(!Number.isFinite(Number(s.encounter.round)) || Number(s.encounter.round)<1) s.encounter.round=1;
  if(typeof s.encounter.turnStarted!=="boolean") s.encounter.turnStarted=Number(s.encounter.round)>1;
  s.encounter.combatants=s.encounter.combatants.map(c=>({
    id:c.id || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()+Math.random())),
    name:c.name || "Combatant",
    initiative:Number(c.initiative)||0,
    type:c.type || "neutral",
    linkedCharacterId:c.linkedCharacterId || null,
    linkedCompanionId:c.linkedCompanionId || null,
    damageTaken:Math.max(0,Number(c.damageTaken)||0),
    damageHistory:Array.isArray(c.damageHistory)?c.damageHistory:[],
    status:c.status || "normal",
    conditions:Array.isArray(c.conditions)?c.conditions:[],
    concentration:c.concentration || "",
    notes:c.notes || ""
  }));
  s.companions=s.companions.map(comp=>normalizeCompanion(comp));
  s.characters=s.characters.map(ch=>{
    if(!Array.isArray(ch.inventory)) ch.inventory=[];
    if(!Array.isArray(ch.journalNotes)) ch.journalNotes=[];
    ch.journalNotes=ch.journalNotes.map(normalizeJournalNote);
    if(window.DND_EFFECTS) window.DND_EFFECTS.ensure(ch);
    else if(!Array.isArray(ch.activeEffects)) ch.activeEffects=[];
    if(ch.aurora && typeof ch.aurora==="object"){
      if(!Array.isArray(ch.aurora.allSpells)) ch.aurora.allSpells=Array.isArray(ch.aurora.spells)?[...ch.aurora.spells]:[];
      if(!ch.aurora.importPrepared || typeof ch.aurora.importPrepared!=="object"){
        ch.aurora.importPrepared=Object.fromEntries((ch.aurora.allSpells||[]).map(s=>[s.id||s.name,!!s.prepared]));
      }
      if(!Number.isFinite(Number(ch.aurora.preparedLimit))){
        ch.aurora.preparedLimit=(ch.aurora.allSpells||[]).filter(s=>!s.alwaysPrepared&&!s.known&&s.prepared).length;
      }
      if(!ch.aurora.currency || typeof ch.aurora.currency!=="object") ch.aurora.currency={...(ch.currency||{cp:0,sp:0,ep:0,gp:0,pp:0})};
      if(!Array.isArray(ch.aurora.equipment)) ch.aurora.equipment=[];
      ch.aurora.equipment=ch.aurora.equipment.map(normalizeInventoryItem);
      if(!Array.isArray(ch.aurora.importEquipment)) ch.aurora.importEquipment=deepClone(ch.aurora.equipment);
      if(!Array.isArray(ch.aurora.importJournalNotes)) ch.aurora.importJournalNotes=deepClone(ch.journalNotes);
    }
    if(!Array.isArray(ch.resources)) ch.resources=[];
    if(!Array.isArray(ch.favouriteActions)) ch.favouriteActions=[];
    ch.resources=ch.resources.map(r=>({
      ...r,
      current:Math.max(0,Number(r.current)||0),
      max:Math.max(1,Number(r.max)||1),
      reset:r.reset||"manual",
      shortRestore:r.shortRestore??null,
      autoKey:r.autoKey||null,
      source:r.source||null,
      featureId:r.featureId||null,
      spellId:r.spellId||null,
      resourceKind:r.resourceKind||null
    }));
    return ch;
  });
  // v1.7.0 migration: linked-character conditions/concentration previously lived only
  // on the Encounter row. Promote that state into the character effects system.
  if(window.DND_EFFECTS){
    for(const combatant of s.encounter.combatants||[]){
      if(!combatant.linkedCharacterId) continue;
      const ch=s.characters.find(x=>x.id===combatant.linkedCharacterId);
      if(!ch) continue;
      for(const cond of combatant.conditions||[]){
        if(window.DND_EFFECTS.CONDITION_DEFS[cond] && !window.DND_EFFECTS.getCondition(ch,cond)){
          window.DND_EFFECTS.setCondition(ch,cond,true,{source:"Encounter migration"});
        }
      }
      if(combatant.concentration && !window.DND_EFFECTS.getConcentration(ch)){
        const blocksConcentration=window.DND_EFFECTS.getConditions(ch).some(e=>window.DND_EFFECTS.CONDITION_DEFS[e.conditionName]?.endsConcentration);
        if(!blocksConcentration){
          window.DND_EFFECTS.add(ch,{name:combatant.concentration,source:"Encounter migration",summary:`Concentrating on ${combatant.concentration}.`,duration:"concentration",concentration:true,custom:true});
        }
      }
    }
  }
  if(Number(s.navigationVersion)!==180){
    s.activeTab="quickplay";
    s.navigationVersion=180;
  }
  if(!["quickplay","character","actions","effects","inventory","companions","notes","encounter"].includes(s.activeTab)) s.activeTab="quickplay";
  return s;
}

let state = loadState();
let currentId = state.currentId || state.characters[0]?.id;
let openCombatantId = null;


function isUntouchedDefaultPlaceholderCharacter(c,stateObj=null){
  if(!c || c.name!=="My Character" || c.aurora) return false;

  const hp=c.hp||{};
  if(Number(hp.current)!==10 || Number(hp.max)!==10 || Number(hp.temp)!==0) return false;
  if(!!c.inspiration) return false;
  if(Number(c.death?.success||0)!==0 || Number(c.death?.failure||0)!==0) return false;

  const slots=c.spellSlots||{};
  for(let lvl=1;lvl<=9;lvl++){
    const s=slots[lvl]||{};
    if(Number(s.used||0)!==0 || Number(s.max||0)!==0) return false;
  }

  const hd=Array.isArray(c.hitDice)?c.hitDice:[];
  if(hd.length!==1 || hd[0]?.die!=="d8" || Number(hd[0]?.used||0)!==0 || Number(hd[0]?.max||0)!==1) return false;

  const money=c.currency||{};
  if(["cp","sp","ep","gp","pp"].some(k=>Number(money[k]||0)!==0)) return false;
  if((c.resources||[]).length) return false;
  if((c.inventory||[]).length) return false;
  if((c.journalNotes||[]).length) return false;

  // Never auto-remove it if the user has attached session data to it.
  if(stateObj){
    if((stateObj.companions||[]).some(x=>x.ownerCharacterId===c.id)) return false;
    if((stateObj.encounter?.combatants||[]).some(x=>x.linkedCharacterId===c.id)) return false;
  }

  return true;
}

function migrateDefaultPlaceholderAfterAuroraImport(s){
  if(!s?.characters?.some(c=>!!c.aurora)) return s;

  const removable=s.characters.filter(c=>isUntouchedDefaultPlaceholderCharacter(c,s));
  if(!removable.length) return s;

  const removeIds=new Set(removable.map(c=>c.id));
  s.characters=s.characters.filter(c=>!removeIds.has(c.id));

  if(!s.characters.length) return s;

  if(removeIds.has(s.currentId) || !s.characters.some(c=>c.id===s.currentId)){
    const imported=s.characters.find(c=>!!c.aurora);
    s.currentId=(imported||s.characters[0]).id;
  }

  return s;
}

function loadState(){
  try{
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if(parsed?.characters?.length){
      const normalized=normalizeAppState(parsed);
      return migrateDefaultPlaceholderAfterAuroraImport(normalized);
    }
  }catch{}
  const c = defaultCharacter("My Character");
  return normalizeAppState({currentId:c.id, characters:[c], theme:"dark", encounter:defaultEncounter(), activeTab:"quickplay", navigationVersion:180});
}
function saveState(){
  state.currentId=currentId;
  localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
}
function current(){
  return state.characters.find(c=>c.id===currentId) || state.characters[0];
}
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
const q=s=>document.querySelector(s);
const qa=s=>[...document.querySelectorAll(s)];


function deepClone(value){ return JSON.parse(JSON.stringify(value)); }
function newUuid(){
  if(crypto?.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{
    const r=Math.random()*16|0,v=c==="x"?r:(r&3|8); return v.toString(16);
  });
}
function normalizeInventoryItem(it={}){
  return {
    identifier:it.identifier||newUuid(),
    name:it.name||"Item",
    id:it.id||"",
    equipped:!!it.equipped,
    location:it.location||"",
    sidebar:!!it.sidebar,
    adorners:Array.isArray(it.adorners)?it.adorners.map(a=>({name:a.name||"",id:a.id||""})):[],
    notes:it.notes||"",
    attuned:!!it.attuned,
    chargesCurrent:it.chargesCurrent===null||it.chargesCurrent===undefined?null:Math.max(0,Number(it.chargesCurrent)||0)
  };
}
function inventoryFor(c=current()){
  return c?.aurora ? c.aurora.equipment : c.inventory;
}
function itemDef(id){ return window.AURORA_ITEMS?.[id]||null; }
function itemDisplayDef(item){
  const ad=(item?.adorners||[]).length ? itemDef(item.adorners[item.adorners.length-1].id) : null;
  return ad || itemDef(item?.id) || null;
}
function inventoryKey(item){
  return JSON.stringify({id:item.id,name:item.name,equipped:!!item.equipped,location:item.location||"",adorners:(item.adorners||[]).map(a=>a.id),notes:item.notes||"",attuned:!!item.attuned,chargesCurrent:item.chargesCurrent??null});
}
function equipmentComparable(list){
  return (list||[]).map(it=>({
    identifier:it.identifier||"",name:it.name||"",id:it.id||"",equipped:!!it.equipped,
    location:it.location||"",sidebar:!!it.sidebar,
    adorners:(it.adorners||[]).map(a=>({name:a.name||"",id:a.id||""})),notes:it.notes||""
  }));
}
function equipmentEquals(a,b){ return JSON.stringify(equipmentComparable(a))===JSON.stringify(equipmentComparable(b)); }
function auroraInventoryDirty(c=current()){
  return !!c?.aurora && !equipmentEquals(c.aurora.equipment,c.aurora.importEquipment);
}


const PACT_CHAIN_ID="ID_WOTC_PHB24_CLASS_FEATURE_ELDRITCH_INVOCATION_PACT_OF_THE_CHAIN";
const INVESTMENT_CHAIN_ID="ID_WOTC_PHB24_CLASS_FEATURE_ELDRITCH_INVOCATION_INVESTMENT_OF_THE_CHAIN_MASTER";
const FIND_FAMILIAR_ID="ID_WOTC_PHB24_SPELL_FIND_FAMILIAR";
const HOMUNCULUS_SPELL_ID="ID_WOTC_EFOTA_SPELL_HOMUNCULUS_SERVANT";
const HOMUNCULUS_COMPANION_ID="ID_WOTC_EFOTA_COMPANION_HOMUNCULUS_SERVANT";

const STEEL_DEFENDER_FEATURE_ID="ID_WOTC_EFOTA_ARCHETYPE_FEATURE_ARTIFICER_BATTLE_SMITH_STEEL_DEFENDER";
const STEEL_DEFENDER_COMPANION_ID="ID_WOTC_EFOTA_COMPANION_ARTIFICER_BATTLE_SMITH_STEEL_DEFENDER";

const PRIMAL_COMPANION_FEATURE_ID="ID_WOTC_PHB24_ARCHETYPE_FEATURE_RANGER_BEAST_MASTER_PRIMAL_COMPANION";
const PRIMAL_LAND_ID="ID_WOTC_PHB24_COMPANION_RANGER_BEAST_MASTER_PRIMAL_COMPANION_BEAST_OF_THE_LAND";
const PRIMAL_SEA_ID="ID_WOTC_PHB24_COMPANION_RANGER_BEAST_MASTER_PRIMAL_COMPANION_BEAST_OF_THE_SEA";
const PRIMAL_SKY_ID="ID_WOTC_PHB24_COMPANION_RANGER_BEAST_MASTER_PRIMAL_COMPANION_BEAST_OF_THE_SKY";

const DRAKE_COMPANION_FEATURE_ID="ID_WOTC_FTOD_ARCHETYPE_FEATURE_DRAKEWARDEN_DRAKE_COMPANION";
const DRAKE_SMALL_ID="ID_WOTC_FTOD_COMPANION_DRAKEWARDEN_DRAKE_COMPANION_SMALL";
const DRAKE_MEDIUM_ID="ID_WOTC_FTOD_COMPANION_DRAKEWARDEN_DRAKE_COMPANION_MEDIUM";
const DRAKE_LARGE_ID="ID_WOTC_FTOD_COMPANION_DRAKEWARDEN_DRAKE_COMPANION_LARGE";

const WILDFIRE_SPIRIT_FEATURE_ID="ID_WOTC_TCOE_ARCHETYPE_FEATURE_CIRCLE_OF_WILDFIRE_SUMMON_WILDFIRE_SPIRIT";
const WILDFIRE_SPIRIT_COMPANION_ID="ID_WOTC_TCOE_COMPANION_WILDFIRE_SPIRIT";

function normalizeCompanion(comp={}){
  const hpMax=Math.max(1,Number(comp.hp?.max)||1);
  const presetType=comp.presetType||"custom";
  const formId=comp.formId||"";
  const formDef=window.AURORA_COMPANIONS?.[formId]||null;
  let spiritType=comp.spiritType||"";
  // Special Pact forms keep the creature type from their actual stat block.
  // This also repairs older saved companions that defaulted to Fey.
  if(presetType==="chain" && formDef?.category==="variant" && formDef.type) spiritType=formDef.type;
  return {
    id:comp.id||newUuid(),
    ownerCharacterId:comp.ownerCharacterId||null,
    presetType,
    formId,
    name:comp.name||"Companion",
    spiritType,
    damageType:["Acid","Cold","Fire","Lightning","Poison"].includes(comp.damageType)?comp.damageType:"Fire",
    summonLevel:Math.max(2,Math.min(9,Number(comp.summonLevel)||2)),
    hp:{
      current:clamp(Number(comp.hp?.current ?? hpMax)||0,0,hpMax),
      max:hpMax,
      temp:Math.max(0,Number(comp.hp?.temp)||0)
    },
    customAc:Number(comp.customAc ?? comp.ac ?? 10)||0,
    customSpeed:comp.customSpeed||comp.speed||"",
    customType:comp.customType||comp.type||"",
    notes:comp.notes||"",
    createdAt:comp.createdAt||new Date().toISOString()
  };
}
function companionOwner(comp){
  return state.characters.find(c=>c.id===comp?.ownerCharacterId)||null;
}
function companionDef(comp){
  if(comp?.presetType==="homunculus") return window.AURORA_COMPANIONS?.[HOMUNCULUS_COMPANION_ID]||null;
  if(comp?.presetType==="steel") return window.AURORA_COMPANIONS?.[STEEL_DEFENDER_COMPANION_ID]||null;
  if(comp?.presetType==="wildfire") return window.AURORA_COMPANIONS?.[WILDFIRE_SPIRIT_COMPANION_ID]||null;
  if(comp?.presetType==="drake"){
    const owner=companionOwner(comp);
    const lvl=auroraClassLevel(owner?.aurora?.classLevels||[],"ranger");
    const id=lvl>=15?DRAKE_LARGE_ID:lvl>=7?DRAKE_MEDIUM_ID:DRAKE_SMALL_ID;
    return window.AURORA_COMPANIONS?.[id]||null;
  }
  return window.AURORA_COMPANIONS?.[comp?.formId]||null;
}
function firstNumber(text,fallback=0){
  const m=String(text||"").match(/-?\d+/); return m?Number(m[0]):fallback;
}
function ownerProficiency(owner){
  const lvl=Math.max(1,Number(owner?.aurora?.level)||1);
  return 2+Math.floor((lvl-1)/4);
}
function ownerAbilityModifier(owner,ability){
  return Math.floor((Number(owner?.aurora?.abilities?.[ability]||10)-10)/2);
}
function ownerClassLevel(owner,className){
  return auroraClassLevel(owner?.aurora?.classLevels||[],className);
}
function signedNumber(n){
  n=Number(n)||0;
  return `${n>=0?"+":""}${n}`;
}
function companionComputed(comp){
  const owner=companionOwner(comp);
  let def=companionDef(comp);
  const proficiency=ownerProficiency(owner);
  const spellAttack=Number(owner?.aurora?.spellcasting?.attack)||0;
  const spellDc=Number(owner?.aurora?.spellcasting?.dc)||0;
  const intMod=ownerAbilityModifier(owner,"intelligence");
  const wisMod=ownerAbilityModifier(owner,"wisdom");
  const artificerLevel=ownerClassLevel(owner,"artificer");
  const rangerLevel=ownerClassLevel(owner,"ranger");
  const druidLevel=ownerClassLevel(owner,"druid");

  let maxHp=comp.hp?.max||1;
  let ac=comp.customAc||10;
  let speed=comp.customSpeed||"";
  let type=comp.customType||"";

  if(def){
    ac=firstNumber(def.ac,ac);
    speed=def.speed||speed;
    type=[def.size,def.type].filter(Boolean).join(" ");

    const specialPact=comp.presetType==="chain" && def.category==="variant";
    if((comp.presetType==="familiar" || comp.presetType==="chain") && comp.spiritType && !specialPact){
      type=[def.size,comp.spiritType].filter(Boolean).join(" ");
    }

    if(comp.presetType==="homunculus"){
      maxHp=5+(5*Math.max(2,Number(comp.summonLevel)||2));
    }else if(comp.presetType==="steel"){
      ac=12+intMod;
      maxHp=5+(5*Math.max(0,artificerLevel));
    }else if(comp.presetType==="primal"){
      ac=13+wisMod;
      maxHp=comp.formId===PRIMAL_SKY_ID
        ? 4+(4*Math.max(0,rangerLevel))
        : 5+(5*Math.max(0,rangerLevel));
    }else if(comp.presetType==="drake"){
      ac=14+proficiency;
      maxHp=5+(5*Math.max(0,rangerLevel));
      const essence=comp.damageType||"Fire";
      def={
        ...def,
        immunities:essence,
        traits:(def.traits||[]).map(x=>x.name==="Draconic Essence"
          ? {...x,description:`<p>When summoned, this drake's Draconic Essence is <b>${escapeHtml(essence)}</b>. It is immune to ${escapeHtml(essence)} damage, and its Infused Strikes deal that damage type.</p>`}
          : x)
      };
    }else if(comp.presetType==="wildfire"){
      ac=13;
      maxHp=5+(5*Math.max(0,druidLevel));
    }else{
      maxHp=Math.max(1,firstNumber(def.hp,maxHp));
    }
  }

  return {
    owner,def,maxHp:Math.max(1,maxHp),ac,speed,type,
    proficiency,spellAttack,spellDc,intMod,wisMod,
    artificerLevel,rangerLevel,druidLevel,
    pactChain:!!owner?.aurora?.activeIds?.includes(PACT_CHAIN_ID),
    investment:!!owner?.aurora?.activeIds?.includes(INVESTMENT_CHAIN_ID)
  };
}
function companionSharesOwnerInitiative(comp){
  return ["homunculus","steel","primal","drake","wildfire"].includes(comp?.presetType);
}
function syncCompanionDerivedHp(comp){
  const calc=companionComputed(comp);
  const oldMax=Math.max(1,Number(comp.hp?.max)||1);
  const oldCurrent=clamp(Number(comp.hp?.current)||0,0,oldMax);
  const damage=Math.max(0,oldMax-oldCurrent);
  comp.hp.max=calc.maxHp;
  comp.hp.current=clamp(calc.maxHp-damage,0,calc.maxHp);
}
function currentCompanions(){
  return (state.companions||[]).filter(x=>x.ownerCharacterId===currentId);
}
function getCompanion(id){ return (state.companions||[]).find(x=>x.id===id)||null; }
function auroraHasSpell(owner,id){
  return !!owner?.aurora && [...(owner.aurora.cantrips||[]),...(owner.aurora.allSpells||[])].some(s=>s.id===id);
}
function companionEncounterCombatant(comp){
  return encounter().combatants.find(c=>c.linkedCompanionId===comp?.id)||null;
}

function renderAll(){
  renderCharacters();
  const c=current();
  q("#currentHp").textContent=c.hp.current;
  q("#maxHp").textContent=c.hp.max;
  q("#maxHpInput").value=c.hp.max;
  q("#tempHpInput").value=c.hp.temp;
  q("#hpPercent").textContent = c.hp.max ? Math.round((c.hp.current/c.hp.max)*100)+"%" : "—";
  q("#inspiration").checked=c.inspiration;
  renderDeath();
  renderSlots();
  renderHitDice();
  renderCurrency();
  renderResources();
  renderAuroraProfile();
  renderArmorClassDisplays();
  syncAllCharacterEffectsToEncounter();
  renderActions();
  renderEffects();
  renderQuickPlay();
  renderInventory();
  renderCompanions();
  renderJournalNotes();
  renderAppPage();
  renderEncounter();
  applyTheme();
  saveState();
}
function renderCharacters(){
  const sel=q("#characterSelect");
  sel.innerHTML=state.characters.map(c=>`<option value="${c.id}" ${c.id===currentId?"selected":""}>${escapeHtml(c.name)}</option>`).join("");
}
function renderDeath(){
  for(const [key,containerId,cls] of [["success","#deathSuccesses","success"],["failure","#deathFailures","failure"]]){
    const box=q(containerId); box.innerHTML="";
    for(let i=1;i<=3;i++){
      const b=document.createElement("button");
      b.className="dot "+cls+(current().death[key]>=i?" active":"");
      b.type="button";
      b.addEventListener("click",()=>{
        current().death[key]= current().death[key]===i ? i-1 : i;
        renderDeath(); saveState();
      });
      box.appendChild(b);
    }
  }
}
function renderSlots(){
  const box=q("#spellSlots"); box.innerHTML="";
  for(let lvl=1;lvl<=9;lvl++){
    const c=current();
    const s=c.spellSlots[lvl] || {used:0,max:0};
    const remaining=Math.max(0,s.max-s.used);
    const pact=window.DND_REST_RULES.getPactMagicInfo(c);
    const isPactSlot=pact.exclusive && pact.slotLevel===lvl && Number(s.max)>0;
    const div=document.createElement("div"); div.className="slot";
    div.innerHTML=`
      <div class="slot-title"><strong>Level ${lvl}${isPactSlot?" • Pact Magic":""}</strong><span class="muted small">${remaining} left${isPactSlot?" • Short Rest":""}</span></div>
      <div class="slot-controls">
        <button class="secondary slot-dec" type="button">−</button>
        <div class="slot-count">${remaining} / ${s.max}</div>
        <button class="secondary slot-inc" type="button">+</button>
      </div>
      <label class="field slot-max"><span>Maximum</span><input type="number" min="0" max="20" value="${s.max}"></label>`;
    div.querySelector(".slot-dec").onclick=()=>{ s.used=clamp(s.used+1,0,s.max); renderSlots(); saveState(); };
    div.querySelector(".slot-inc").onclick=()=>{ s.used=clamp(s.used-1,0,s.max); renderSlots(); saveState(); };
    div.querySelector("input").onchange=e=>{
      s.max=Math.max(0,Number(e.target.value)||0);
      s.used=clamp(s.used,0,s.max);
      renderSlots(); saveState();
    };
    box.appendChild(div);
  }
}
function renderHitDice(){
  const box=q("#hitDiceList"); box.innerHTML="";
  current().hitDice.forEach((h,idx)=>{
    const rem=Math.max(0,h.max-h.used);
    const div=document.createElement("div"); div.className="hitdie";
    div.innerHTML=`
      <div class="hitdie-main">
        <div class="hitdie-title">${escapeHtml(h.die)}</div>
        <div class="muted small">${rem} of ${h.max} remaining</div>
      </div>
      <div class="counter">
        <button class="secondary dec">−</button><strong>${rem}/${h.max}</strong><button class="secondary inc">+</button>
        <button class="danger ghost del">×</button>
      </div>`;
    div.querySelector(".dec").onclick=()=>{h.used=clamp(h.used+1,0,h.max);renderHitDice();saveState()};
    div.querySelector(".inc").onclick=()=>{h.used=clamp(h.used-1,0,h.max);renderHitDice();saveState()};
    div.querySelector(".del").onclick=()=>{current().hitDice.splice(idx,1);renderHitDice();saveState()};
    box.appendChild(div);
  });
  if(!current().hitDice.length) box.innerHTML='<div class="muted small">No hit dice configured.</div>';
}
function currencyEquals(a,b){
  return ["cp","sp","ep","gp","pp"].every(k=>Number(a?.[k]||0)===Number(b?.[k]||0));
}
function renderCurrency(){
  const c=current();
  qa("[data-currency]").forEach(inp=>{
    const k=inp.dataset.currency;
    inp.value=c.currency[k] ?? 0;
  });
  const reset=q("#resetCurrencyBtn");
  const status=q("#currencySyncStatus");
  if(!c.aurora){
    reset?.classList.add("hidden");
    if(status) status.textContent="Stored locally";
    return;
  }
  reset?.classList.remove("hidden");
  const dirty=!currencyEquals(c.currency,c.aurora.currency);
  if(status){
    status.textContent=dirty?"Changed in app • Save to Aurora to write back":"Matches Aurora";
    status.classList.toggle("sync-dirty",dirty);
  }
  if(reset) reset.disabled=!dirty;
}
function resourceRecoveryLabel(r){
  if(r.reset==="short") return "Full on Short Rest";
  if(Number(r.shortRestore)>0) return `+${r.shortRestore} on Short Rest • Full on Long Rest`;
  if(r.reset==="long") return "Full on Long Rest";
  return "Manual recovery";
}


function resourceFeatureLevel(def,aurora){
  if(!def) return Number(aurora?.level)||0;
  if(def.ownerClass){
    return auroraClassLevel(aurora?.classLevels||[],def.ownerClass);
  }
  return Number(aurora?.level)||0;
}

function resourceDescriptionHtml(def,aurora){
  if(!def) return "";
  const level=resourceFeatureLevel(def,aurora);
  const descriptions=(def.descriptions||[])
    .filter(d=>(Number(d.level)||0)<=level)
    .sort((a,b)=>(Number(a.level)||0)-(Number(b.level)||0));

  if(!descriptions.length) return "";

  // Main description + all unlocked level-specific additions.
  return descriptions.map(d=>{
    const heading=Number(d.level)>0
      ? `<h4>Level ${Number(d.level)}</h4>`
      : "";
    return `${heading}${d.html||`<p>${escapeHtml(d.text||"")}</p>`}`;
  }).join("");
}

function showAuroraResourceDetails(resource){
  const featureId=resource?.featureId ||
    (String(resource?.autoKey||"").startsWith("aurora:")
      ? String(resource.autoKey).split(":")[1]
      : null);

  const def=window.AURORA_RESOURCE_DEFS?.[featureId];
  if(!def){
    alert(`No Aurora feature description was found for ${resource?.name || "this resource"}.`);
    return;
  }

  q("#resourceDetailsName").textContent=def.name || resource.name || "Resource";
  q("#resourceDetailsSource").textContent=def.source || resource.source || "";

  const meta=[
    `Current: ${resource.current}/${resource.max}`,
    resourceRecoveryLabel(resource)
  ];
  if(def.ownerClass) meta.push(def.ownerClass.charAt(0).toUpperCase()+def.ownerClass.slice(1));

  q("#resourceDetailsMeta").innerHTML=
    meta.map(x=>`<span class="mini-tag">${escapeHtml(x)}</span>`).join("");

  const description=resourceDescriptionHtml(def,current().aurora);
  q("#resourceDetailsDescription").innerHTML=
    description || '<p class="muted">No description was included in the Aurora element.</p>';

  q("#resourceDetailsDialog").showModal();
}

q("#resourceDetailsClose").onclick=()=>q("#resourceDetailsDialog").close();

function renderResources(){
  const box=q("#resourceList"); box.innerHTML="";
  current().resources.forEach((r,idx)=>{
    const div=document.createElement("div");
    const isFreeSpell=r.resourceKind==="freecast-spell" && r.spellId;
    div.className=`resource ${isFreeSpell?"freecast-resource":""}`;

    if(isFreeSpell){
      const available=Number(r.current)>0;
      div.innerHTML=`
        <button type="button" class="resource-main resource-open-button" aria-label="Open ${escapeHtml(r.name)} spell details">
          <div class="resource-title-row">
            <div class="resource-title">${escapeHtml(r.name)}</div>
            <span class="auto-resource-badge">AURORA</span>
          </div>
          <div class="muted small resource-note">${escapeHtml(resourceRecoveryLabel(r))}</div>
          <div class="muted small resource-note">Tap for spell details</div>
        </button>
        <div class="freecast-action">
          <div class="freecast-state ${available?"available":"used"}">${available?"Available":"Used"}</div>
          <button class="${available?"danger":"secondary"} freecast-use-btn" type="button">
            ${available?"Use":"Restore"}
          </button>
        </div>`;

      div.querySelector(".resource-open-button").onclick=()=>{
        showAuroraSpell(r.spellId,r.name.replace(/\s*\(Free Cast\)\s*$/i,""));
      };
      div.querySelector(".freecast-use-btn").onclick=()=>useFreeCastResource(r);
      box.appendChild(div);
      return;
    }

    const auto=!!r.autoKey;
    const canOpenFeature=auto && !!r.featureId && !!window.AURORA_RESOURCE_DEFS?.[r.featureId];
    div.innerHTML=`
      ${canOpenFeature
        ? `<button type="button" class="resource-main resource-open-button feature-resource-open" aria-label="Open ${escapeHtml(r.name)} details">
            <div class="resource-title-row">
              <div class="resource-title">${escapeHtml(r.name)}</div>
              <span class="auto-resource-badge">AURORA</span>
            </div>
            <div class="muted small resource-note">${escapeHtml(resourceRecoveryLabel(r))}</div>
            <div class="muted small resource-note">Tap for feature details</div>
          </button>`
        : `<div class="resource-main">
            <div class="resource-title-row">
              <div class="resource-title">${escapeHtml(r.name)}</div>
              ${auto?'<span class="auto-resource-badge">AURORA</span>':""}
            </div>
            <div class="muted small resource-note">${escapeHtml(resourceRecoveryLabel(r))}</div>
          </div>`}
      <div class="counter">
        <button class="secondary dec">−</button><strong>${r.current}/${r.max}</strong><button class="secondary inc">+</button>
        ${auto?"":'<button class="danger ghost del">×</button>'}
      </div>`;
    const featureOpen=div.querySelector(".feature-resource-open");
    if(featureOpen) featureOpen.onclick=()=>showAuroraResourceDetails(r);
    div.querySelector(".dec").onclick=()=>{r.current=clamp(r.current-1,0,r.max);renderResources();saveState()};
    div.querySelector(".inc").onclick=()=>{r.current=clamp(r.current+1,0,r.max);renderResources();saveState()};
    const del=div.querySelector(".del");
    if(del) del.onclick=()=>{current().resources.splice(idx,1);renderResources();saveState()};
    box.appendChild(div);
  });
  if(!current().resources.length) box.innerHTML='<div class="muted small">Import an Aurora character to populate supported limited-use features automatically, or add a custom resource.</div>';
}

function applyTheme(){
  document.documentElement.dataset.theme=state.theme||"dark";
}
function adjustHp(amount){
  const c=current();
  if(amount<0 && c.hp.temp>0){
    const dmg=-amount;
    const absorb=Math.min(c.hp.temp,dmg);
    c.hp.temp-=absorb;
    const rest=dmg-absorb;
    c.hp.current=clamp(c.hp.current-rest,0,c.hp.max);
  }else{
    c.hp.current=clamp(c.hp.current+amount,0,c.hp.max);
  }

  const combatant=encounter().combatants.find(x=>x.linkedCharacterId===c.id);
  if(combatant){
    if(c.hp.current===0 && combatant.status==="normal") combatant.status="down";
    if(c.hp.current>0 && combatant.status==="down") combatant.status="normal";
  }

  renderAll();
}
function escapeHtml(s=""){
  return s.replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[ch]));
}

// HP
qa("[data-hp]").forEach(b=>b.onclick=()=>adjustHp(Number(b.dataset.hp)));
q("#damageBtn").onclick=()=>adjustHp(-(Math.abs(Number(q("#hpDelta").value)||0)));
q("#healBtn").onclick=()=>adjustHp(Math.abs(Number(q("#hpDelta").value)||0));
q("#maxHpInput").onchange=e=>{
  const c=current();
  c.hp.max=Math.max(1,Number(e.target.value)||1);
  c.hp.current=clamp(c.hp.current,0,c.hp.max);
  const combatant=encounter().combatants.find(x=>x.linkedCharacterId===c.id);
  if(combatant){
    if(c.hp.current===0 && combatant.status==="normal") combatant.status="down";
    if(c.hp.current>0 && combatant.status==="down") combatant.status="normal";
  }
  renderAll();
};
q("#tempHpInput").onchange=e=>{current().hp.temp=Math.max(0,Number(e.target.value)||0);renderAll()};

// Status
q("#inspiration").onchange=e=>{current().inspiration=e.target.checked;saveState()};
q("#resetDeathBtn").onclick=()=>{current().death={success:0,failure:0};renderDeath();saveState()};

// Slots
q("#resetSlotsBtn").onclick=()=>{Object.values(current().spellSlots).forEach(s=>s.used=0);renderSlots();saveState()};

// Currency
qa("[data-currency]").forEach(inp=>inp.onchange=e=>{
  current().currency[inp.dataset.currency]=Math.max(0,Math.floor(Number(e.target.value)||0));
  renderCurrency(); saveState();
});
q("#resetCurrencyBtn").onclick=()=>{
  const c=current();
  if(!c.aurora?.currency) return;
  c.currency={...c.aurora.currency};
  renderCurrency(); saveState();
};

// Characters
q("#characterSelect").onchange=e=>{currentId=e.target.value;state.activeTab="quickplay";renderAll()};
q("#newCharacterBtn").onclick=()=>{
  const name=prompt("Character name:","New Character");
  if(!name) return;
  const c=defaultCharacter(name.trim());
  state.characters.push(c); currentId=c.id; state.activeTab="quickplay"; renderAll();
};
q("#renameCharacterBtn").onclick=()=>{
  const c=current(); const name=prompt("Rename character:",c.name);
  if(name?.trim()){c.name=name.trim();renderAll();}
};
q("#deleteCharacterBtn").onclick=()=>{
  if(state.characters.length===1){alert("You need at least one character.");return}
  const c=current();
  if(confirm(`Delete ${c.name}? This also removes companions owned by this character.`)){
    const companionIds=new Set((state.companions||[]).filter(x=>x.ownerCharacterId===c.id).map(x=>x.id));
    state.companions=(state.companions||[]).filter(x=>x.ownerCharacterId!==c.id);
    encounter().combatants=encounter().combatants.filter(x=>x.linkedCharacterId!==c.id && !companionIds.has(x.linkedCompanionId));
    state.characters=state.characters.filter(x=>x.id!==c.id);
    currentId=state.characters[0].id; renderAll();
  }
};

// Resources dialog
q("#addResourceBtn").onclick=()=>q("#resourceDialog").showModal();
q("#cancelResourceBtn").onclick=()=>q("#resourceDialog").close();
q("#resourceForm").addEventListener("submit",e=>{
  if(e.submitter?.value==="cancel") return;
  e.preventDefault();
  const name=q("#resourceName").value.trim();
  const max=Math.max(1,Number(q("#resourceMax").value)||1);
  if(!name) return;
  current().resources.push({name,max,current:max,reset:q("#resourceReset").value});
  q("#resourceName").value=""; q("#resourceMax").value=1; q("#resourceReset").value="long";
  q("#resourceDialog").close(); renderAll();
});

// Hit dice dialog
q("#addHitDieBtn").onclick=()=>q("#hitDieDialog").showModal();
q("#cancelHitDieBtn").onclick=()=>q("#hitDieDialog").close();
q("#hitDieForm").addEventListener("submit",e=>{
  if(e.submitter?.value==="cancel") return;
  e.preventDefault();
  const max=Math.max(1,Number(q("#hitDieMax").value)||1);
  current().hitDice.push({die:q("#hitDieType").value,max,used:0});
  q("#hitDieDialog").close(); renderAll();
});

// Rest — 2024 rules. The pure recovery logic lives in rest-rules.js so it can
// be regression-tested without the Android/WebView DOM.
q("#shortRestBtn").onclick=()=>{
  const c=current();
  const result=window.DND_REST_RULES.applyShortRest(c);
  // Do not guess for Warlock/caster multiclasses: Aurora's combined slot grid
  // does not identify which expended slots came from Pact Magic.
  if(result.pactMagicMixed){
    console.info("Short Rest: Pact Magic is present alongside normal Spellcasting; combined Aurora slots were left unchanged.");
  }
  window.DND_EFFECTS?.applyRest(c,"short");
  syncCharacterEffectsToEncounter(c);
  renderAll();
};
q("#longRestBtn").onclick=()=>{
  const c=current();
  window.DND_REST_RULES.applyLongRest(c);
  window.DND_EFFECTS?.applyRest(c,"long");
  syncCharacterEffectsToEncounter(c);
  renderAll();
};


// Conditions & Active Effects -------------------------------------------------
let managedEffectDetailId=null;

function encounterTurnKey(character=current()){
  const enc=encounter();
  const linked=enc.combatants.find(x=>x.linkedCharacterId===character?.id);
  if(!linked || !enc.currentId) return "";
  return `${Number(enc.round)||1}:${enc.currentId}`;
}
function syncCharacterEffectsToEncounter(character){
  if(!character || !window.DND_EFFECTS) return;
  const linked=encounter().combatants.find(x=>x.linkedCharacterId===character.id);
  if(!linked) return;
  linked.conditions=window.DND_EFFECTS.getConditions(character).map(x=>x.conditionName);
  const concentration=window.DND_EFFECTS.getConcentration(character);
  linked.concentration=concentration?.name||"";
}
function syncAllCharacterEffectsToEncounter(){
  for(const character of state.characters||[]) syncCharacterEffectsToEncounter(character);
}

function armorClassInfo(character=current()){
  if(!window.DND_ARMOR_CLASS) return {available:false,total:null,staticAc:null,effectBonus:0,breakdown:[],warnings:[]};
  return window.DND_ARMOR_CLASS.calculate(character,window.AURORA_ITEMS||{},window.DND_EFFECTS||null);
}
function armorClassBreakdownText(info){
  if(!info?.available) return "Import an Aurora character to calculate AC.";
  return (info.breakdown||[]).map((part,i)=>{
    const value=Number(part.value)||0;
    if(i===0 || part.kind==="base") return `${part.label} ${value}`;
    return `${part.label} ${value>=0?"+":""}${value}`;
  }).join(" • ");
}
function armorClassMarkup(info,compact=false){
  if(!info?.available){
    return compact
      ? '<span class="muted small">Armor Class unavailable until an Aurora character is imported.</span>'
      : '<div class="live-ac-number">—</div><div><strong>Armor Class</strong><div class="muted small">Import Aurora to calculate AC.</div></div>';
  }
  const changed=Number(info.effectBonus)!==0;
  const headline=changed ? `<span class="live-ac-base">${info.staticAc}</span><span class="live-ac-arrow">→</span><span class="live-ac-total">${info.total}</span>` : `<span class="live-ac-total">${info.total}</span>`;
  const breakdown=escapeHtml(armorClassBreakdownText(info));
  const warning=(info.warnings||[]).length?`<div class="live-ac-warning">${escapeHtml(info.warnings.join(" "))}</div>`:"";
  if(compact){
    return `<div class="live-ac-inline"><strong>AC ${headline}</strong>${changed?`<span class="mini-tag">${info.effectBonus>0?"+":""}${info.effectBonus} active</span>`:""}</div><div class="muted small live-ac-breakdown">${breakdown}</div>${warning}`;
  }
  return `<div class="live-ac-number">${headline}</div><div class="live-ac-copy"><strong>Armor Class</strong><div class="muted small live-ac-breakdown">${breakdown}</div>${warning}</div>`;
}
function renderArmorClassDisplays(){
  const info=armorClassInfo();
  const characterBox=q("#characterArmorClass"); if(characterBox) characterBox.innerHTML=armorClassMarkup(info,false);
  const actionsBox=q("#actionsArmorClass"); if(actionsBox) actionsBox.innerHTML=armorClassMarkup(info,true);
  const effectsBox=q("#effectsArmorClass"); if(effectsBox) effectsBox.innerHTML=armorClassMarkup(info,true);
}

function effectSummaryBits(character=current()){
  if(!window.DND_EFFECTS) return [];
  const conditions=window.DND_EFFECTS.getConditions(character);
  const effects=window.DND_EFFECTS.getEffects(character);
  const concentration=window.DND_EFFECTS.getConcentration(character);
  const bits=[];
  if(concentration) bits.push({label:`Concentrating: ${concentration.name}`,kind:"concentration"});
  for(const e of effects.filter(x=>x.id!==concentration?.id).slice(0,3)) bits.push({label:e.name,kind:"effect"});
  for(const e of conditions.slice(0,3)) bits.push({label:e.conditionName,kind:"condition"});
  const ac=window.DND_EFFECTS.totalAcBonus(character);
  if(ac){
    const live=armorClassInfo(character);
    bits.push({label:live.available?`AC ${live.total} (${ac>0?"+":""}${ac} active)`:`Active AC ${ac>0?"+":""}${ac}`,kind:"bonus"});
  }
  return bits;
}
function renderCompactEffectsSummary(selector){
  const box=q(selector);
  if(!box) return;
  const bits=effectSummaryBits();
  if(!bits.length){
    box.innerHTML='<span class="muted small">No active conditions or effects.</span><button type="button" class="secondary small-btn compact-effects-manage">Manage</button>';
  }else{
    box.innerHTML=`<div class="compact-effect-chips">${bits.map(x=>`<span class="effect-summary-chip ${x.kind}">${escapeHtml(x.label)}</span>`).join("")}</div><button type="button" class="secondary small-btn compact-effects-manage">Manage</button>`;
  }
  box.querySelector(".compact-effects-manage").onclick=()=>{state.activeTab="effects";renderAll();};
}
function effectDurationLabel(effect){ return window.DND_EFFECTS?.durationLabel(effect)||"Until removed"; }
function showEffectDetails(id){
  const e=(current().activeEffects||[]).find(x=>x.id===id);
  if(!e) return;
  managedEffectDetailId=id;
  q("#effectDetailEndBtn").classList.remove("hidden");
  q("#effectDetailName").textContent=e.name;
  q("#effectDetailSource").textContent=e.source||"";
  const meta=[e.kind==="condition"?"Condition":"Active Effect",effectDurationLabel(e)];
  if(e.concentration) meta.push("Concentration");
  if(Number(e.acBonus)) meta.push(`AC ${Number(e.acBonus)>0?"+":""}${Number(e.acBonus)}`);
  q("#effectDetailMeta").innerHTML=meta.map(x=>`<span class="mini-tag">${escapeHtml(x)}</span>`).join("");
  const def=e.kind==="condition"?window.DND_EFFECTS?.CONDITION_DEFS?.[e.conditionName]:null;
  q("#effectDetailDescription").innerHTML=e.description||def?.description||`<p>${escapeHtml(e.summary||"No additional details.")}</p>`;
  q("#effectDetailEndBtn").textContent=e.kind==="condition"?"Remove Condition":(e.concentration?"End Concentration":"End Effect");
  q("#effectDetailDialog").showModal();
}
function removeActiveEffect(id){
  const e=(current().activeEffects||[]).find(x=>x.id===id);
  if(!e || !window.DND_EFFECTS) return;
  window.DND_EFFECTS.removeById(current(),id);
  syncCharacterEffectsToEncounter(current());
  renderAll();
}
function adjustEffectCounter(id,delta){
  const e=(current().activeEffects||[]).find(x=>x.id===id);
  if(!e || e.counterMax===null || e.counterCurrent===null) return;
  e.counterCurrent=clamp(Number(e.counterCurrent)+Number(delta),0,Number(e.counterMax));
  if(e.conditionName==="Exhaustion" && e.counterCurrent<=0) window.DND_EFFECTS.removeById(current(),id);
  renderAll();
}
function renderEffects(){
  if(!window.DND_EFFECTS) return;
  const c=current();
  window.DND_EFFECTS.ensure(c);
  const conditions=window.DND_EFFECTS.getConditions(c);
  const effects=window.DND_EFFECTS.getEffects(c);
  const conc=window.DND_EFFECTS.getConcentration(c);
  q("#effectsCharacterMeta").textContent=c.aurora?`${c.name} • ${c.aurora.className||"Aurora character"} • Level ${c.aurora.level||"—"}`:`${c.name} • Local character`;
  q("#effectsConditionCount").textContent=`${conditions.length} condition${conditions.length===1?"":"s"}`;
  q("#effectsActiveCount").textContent=`${effects.length} effect${effects.length===1?"":"s"}`;
  q("#effectsConcentration").textContent=conc?`Concentrating: ${conc.name}`:"No concentration";

  const conditionBox=q("#conditionsList");
  conditionBox.innerHTML=conditions.length?conditions.map(e=>{
    const def=window.DND_EFFECTS.CONDITION_DEFS[e.conditionName]||{};
    const counter=e.counterMax!==null?`<div class="effect-counter"><button type="button" class="secondary effect-counter-dec">−</button><strong>${escapeHtml(e.counterLabel||"Count")} ${e.counterCurrent}/${e.counterMax}</strong><button type="button" class="secondary effect-counter-inc">+</button></div>`:"";
    return `<div class="effect-card condition-effect-card" data-effect-id="${escapeHtml(e.id)}">
      <button type="button" class="effect-card-main"><div class="effect-card-title-row"><strong>${escapeHtml(e.conditionName)}</strong><span class="mini-tag">CONDITION</span></div><div class="muted small">${escapeHtml(e.summary||def.summary||"")}</div></button>
      ${counter}
      <button type="button" class="danger ghost effect-end-btn">Remove</button>
    </div>`;
  }).join(""):'<div class="empty-effects"><strong>No conditions.</strong><div class="muted small top-space">Use + Condition to add one quickly.</div></div>';

  const effectBox=q("#activeEffectsList");
  effectBox.innerHTML=effects.length?effects.map(e=>{
    const tags=[e.concentration?"CONCENTRATION":"EFFECT",Number(e.acBonus)?`AC ${Number(e.acBonus)>0?"+":""}${Number(e.acBonus)}`:""].filter(Boolean);
    const counter=e.counterMax!==null?`<div class="effect-counter"><button type="button" class="secondary effect-counter-dec">−</button><strong>${escapeHtml(e.counterLabel||"Count")} ${e.counterCurrent}/${e.counterMax}</strong><button type="button" class="secondary effect-counter-inc">+</button></div>`:"";
    return `<div class="effect-card" data-effect-id="${escapeHtml(e.id)}">
      <button type="button" class="effect-card-main"><div class="effect-card-title-row"><strong>${escapeHtml(e.name)}</strong><span class="possible-action-tags">${tags.map(x=>`<span class="mini-tag">${escapeHtml(x)}</span>`).join("")}</span></div><div class="muted small">${escapeHtml(e.summary||"")}</div><div class="muted small effect-duration">${escapeHtml(effectDurationLabel(e))}${e.source?` • ${escapeHtml(e.source)}`:""}</div></button>
      ${counter}
      <button type="button" class="danger ghost effect-end-btn">${e.concentration?"End":"Remove"}</button>
    </div>`;
  }).join(""):'<div class="empty-effects"><strong>No active effects.</strong><div class="muted small top-space">Using supported spells can add effects automatically, or use + Custom Effect.</div></div>';

  for(const box of [conditionBox,effectBox]){
    box.querySelectorAll("[data-effect-id]").forEach(row=>{
      const id=row.dataset.effectId;
      row.querySelector(".effect-card-main").onclick=()=>showEffectDetails(id);
      row.querySelector(".effect-end-btn").onclick=()=>removeActiveEffect(id);
      const dec=row.querySelector(".effect-counter-dec"); if(dec) dec.onclick=()=>adjustEffectCounter(id,-1);
      const inc=row.querySelector(".effect-counter-inc"); if(inc) inc.onclick=()=>adjustEffectCounter(id,1);
    });
  }
  renderCompactEffectsSummary("#characterEffectsSummary");
  renderArmorClassDisplays();
}

function renderConditionPicker(){
  const box=q("#conditionPicker");
  const active=new Set(window.DND_EFFECTS.getConditions(current()).map(x=>x.conditionName));
  box.innerHTML=Object.entries(window.DND_EFFECTS.CONDITION_DEFS).map(([name,def])=>`<div class="condition-picker-row">
    <label class="condition-picker-toggle"><input type="checkbox" value="${escapeHtml(name)}" ${active.has(name)?"checked":""}><span><strong>${escapeHtml(name)}</strong><small>${escapeHtml(def.summary||"")}</small></span></label>
    <button type="button" class="secondary condition-info-btn" data-condition-name="${escapeHtml(name)}">?</button>
  </div>`).join("");
  box.querySelectorAll('input[type="checkbox"]').forEach(inp=>inp.onchange=()=>{
    window.DND_EFFECTS.setCondition(current(),inp.value,inp.checked);
    syncCharacterEffectsToEncounter(current());
    renderEffects(); renderActions(); renderEncounter(); saveState();
  });
  box.querySelectorAll(".condition-info-btn").forEach(btn=>btn.onclick=()=>{
    const existing=window.DND_EFFECTS.getCondition(current(),btn.dataset.conditionName);
    if(existing) showEffectDetails(existing.id);
    else{
      const def=window.DND_EFFECTS.CONDITION_DEFS[btn.dataset.conditionName];
      q("#effectDetailName").textContent=btn.dataset.conditionName;
      q("#effectDetailSource").textContent="Standard condition";
      q("#effectDetailMeta").innerHTML='<span class="mini-tag">CONDITION</span>';
      q("#effectDetailDescription").innerHTML=def?.description||"";
      managedEffectDetailId=null;
      q("#effectDetailEndBtn").classList.add("hidden");
      q("#effectDetailDialog").showModal();
    }
  });
}
function openCustomEffectDialog(){
  q("#customEffectName").value="";
  q("#customEffectSource").value="";
  q("#customEffectSummary").value="";
  q("#customEffectDuration").value="manual";
  q("#customEffectRounds").value=10;
  q("#customEffectRoundsRow").classList.add("hidden");
  q("#customEffectAcBonus").value="0";
  q("#customEffectCounterLabel").value="";
  q("#customEffectCounterCurrent").value="";
  q("#customEffectCounterMax").value="";
  q("#customEffectDialog").showModal();
}
function saveCustomEffect(){
  const name=q("#customEffectName").value.trim();
  if(!name) return;
  const duration=q("#customEffectDuration").value;
  const maxRaw=q("#customEffectCounterMax").value;
  const counterMax=maxRaw===""?null:Math.max(1,Number(maxRaw)||1);
  const currentRaw=q("#customEffectCounterCurrent").value;
  const counterCurrent=counterMax===null?null:clamp(currentRaw===""?counterMax:(Number(currentRaw)||0),0,counterMax);
  if(duration==="concentration"){
    const old=window.DND_EFFECTS.getConcentration(current());
    if(old && !confirm(`End concentration on ${old.name} and start ${name}?`)) return;
    window.DND_EFFECTS.clearConcentration(current());
  }
  const summary=q("#customEffectSummary").value.trim();
  window.DND_EFFECTS.add(current(),{
    name,
    source:q("#customEffectSource").value.trim()||"Custom",
    summary,
    description:`<p>${escapeHtml(summary).replace(/\n/g,"<br>")}</p>`,
    duration,
    concentration:duration==="concentration",
    remainingRounds:duration==="rounds"?Math.max(1,Number(q("#customEffectRounds").value)||1):null,
    acBonus:Number(q("#customEffectAcBonus").value)||0,
    counterLabel:q("#customEffectCounterLabel").value.trim(),
    counterCurrent,counterMax,custom:true,createdTurnKey:encounterTurnKey(current())
  });
  syncCharacterEffectsToEncounter(current());
  q("#customEffectDialog").close();
  renderAll();
}

function spellSlotForUse(character,spellLevel){
  const level=Math.max(0,Number(spellLevel)||0);
  if(level===0) return 0;
  const pact=window.DND_REST_RULES?.getPactMagicInfo(character);
  if(pact?.exclusive && pact.slotLevel>=level){
    const s=character.spellSlots?.[pact.slotLevel];
    if(s && Number(s.max)>Number(s.used)) return pact.slotLevel;
  }
  for(let lvl=level;lvl<=9;lvl++){
    const s=character.spellSlots?.[lvl];
    if(s && Number(s.max)>Number(s.used)) return lvl;
  }
  return null;
}
function prepareSpellEffectTrigger(info,spellId){
  if(!window.DND_EFFECTS) return {applySelf:true};
  const currentConc=window.DND_EFFECTS.getConcentration(current());
  if(info.concentration && currentConc && currentConc.linkedSpellId!==spellId){
    if(!confirm(`You are concentrating on ${currentConc.name}. Casting ${info.name} will end it. Continue?`)) return null;
  }
  const template=window.DND_EFFECTS.spellTemplate(info);
  let applySelf=true;
  if(template?.selfMode==="prompt"){
    applySelf=confirm(`Did ${info.name} affect ${current().name} directly?\n\nOK = track the buff/condition on this character\nCancel = do not add the self-buff (concentration is still tracked).\n\nThe spell use is recorded either way.`);
  }
  return {applySelf};
}
function applySpellEffectTrigger(info,spellId,source,prepared){
  if(!window.DND_EFFECTS) return;
  window.DND_EFFECTS.triggerSpell(current(),{...info,id:spellId},{spellId,source,applySelf:prepared?.applySelf!==false,createdTurnKey:encounterTurnKey(current())});
  syncCharacterEffectsToEncounter(current());
}
function useFreeCastResource(resource){
  const available=Number(resource.current)>0;
  if(!available){
    resource.current=resource.max;
    renderAll();
    return;
  }
  const info=window.AURORA_SPELLS?.[resource.spellId];
  if(info){
    const prepared=prepareSpellEffectTrigger(info,resource.spellId);
    if(!prepared) return;
    resource.current=0;
    applySpellEffectTrigger(info,resource.spellId,resource.name||info.name,prepared);
  }else{
    resource.current=0;
  }
  renderAll();
}
function renderSpellUseControls(info,spellId){
  const box=q("#spellUseControls");
  if(!box) return;
  const c=current();
  const free=(c.resources||[]).find(r=>r.resourceKind==="freecast-spell" && r.spellId===spellId && Number(r.current)>0);
  const slotLevel=spellSlotForUse(c,info.level);
  const hasTrigger=!!window.DND_EFFECTS?.spellTemplate(info) || !!info.concentration;
  box.classList.remove("hidden");
  q("#spellUseHint").textContent=hasTrigger?"Using this spell can update Active Effects automatically.":"Use the spell here to keep spell slots/free casts in sync.";
  const freeBtn=q("#spellUseFreeBtn");
  freeBtn.classList.toggle("hidden",!free);
  if(free) freeBtn.textContent="Use Free Cast";
  const castBtn=q("#spellCastSlotBtn");
  if(Number(info.level)===0){
    castBtn.disabled=false;
    castBtn.textContent="Use Cantrip";
  }else if(slotLevel!==null){
    castBtn.disabled=false;
    castBtn.textContent=`Cast • Use Level ${slotLevel} Slot`;
  }else{
    castBtn.disabled=true;
    castBtn.textContent="No Spell Slot Available";
  }
}
function useOpenSpell(mode){
  const spellId=openSpellId;
  const info=window.AURORA_SPELLS?.[spellId];
  if(!info) return;
  const prepared=prepareSpellEffectTrigger(info,spellId);
  if(!prepared) return;
  if(mode==="free"){
    const free=(current().resources||[]).find(r=>r.resourceKind==="freecast-spell" && r.spellId===spellId && Number(r.current)>0);
    if(!free){ alert("That free cast is no longer available."); return; }
    free.current=0;
    applySpellEffectTrigger(info,spellId,free.name||info.name,prepared);
  }else{
    const slotLevel=spellSlotForUse(current(),info.level);
    if(Number(info.level)>0){
      if(slotLevel===null){ alert("No compatible spell slot is available."); return; }
      current().spellSlots[slotLevel].used=clamp(Number(current().spellSlots[slotLevel].used)+1,0,Number(current().spellSlots[slotLevel].max));
    }
    applySpellEffectTrigger(info,spellId,info.source||"Spell",prepared);
  }
  q("#spellDialog").close();
  renderAll();
}

q("#addConditionBtn").onclick=()=>{renderConditionPicker();q("#conditionDialog").showModal();};
q("#closeConditionDialogBtn").onclick=()=>q("#conditionDialog").close();
q("#addCustomEffectBtn").onclick=openCustomEffectDialog;
q("#closeCustomEffectDialogBtn").onclick=()=>q("#customEffectDialog").close();
q("#saveCustomEffectBtn").onclick=saveCustomEffect;
q("#customEffectDuration").onchange=e=>q("#customEffectRoundsRow").classList.toggle("hidden",e.target.value!=="rounds");
q("#closeEffectDetailBtn").onclick=()=>{q("#effectDetailDialog").close();q("#effectDetailEndBtn").classList.remove("hidden");};
q("#effectDetailEndBtn").onclick=()=>{
  if(managedEffectDetailId) removeActiveEffect(managedEffectDetailId);
  q("#effectDetailDialog").close();
  q("#effectDetailEndBtn").classList.remove("hidden");
};
q("#spellUseFreeBtn").onclick=()=>useOpenSpell("free");
q("#spellCastSlotBtn").onclick=()=>useOpenSpell("slot");


const CORE_ACTIONS_2024=[
  {name:"Attack",summary:"Make one or more attacks as allowed by your features.",description:"<p>Use the Attack action to make a weapon or Unarmed Strike attack. Features such as Extra Attack can allow more than one attack as part of this action.</p>"},
  {name:"Dash",summary:"Gain extra movement for this turn.",description:"<p>Take the Dash action to gain additional movement for the current turn equal to your Speed after modifiers.</p>"},
  {name:"Disengage",summary:"Move without provoking Opportunity Attacks.",description:"<p>Take the Disengage action when you need to move away safely. Your movement for the rest of the turn does not provoke Opportunity Attacks.</p>"},
  {name:"Dodge",summary:"Focus entirely on avoiding attacks.",description:"<p>Until the start of your next turn, attacks against you are harder to land when you can see the attacker, and you are better able to avoid Dexterity-saving-throw effects. You lose the benefit if you are Incapacitated or your Speed becomes 0.</p>"},
  {name:"Help",summary:"Assist another creature with a check or attack.",description:"<p>Use Help to assist another creature. Depending on what you help with, this can improve an ability check or help an ally attack a creature within your reach.</p>"},
  {name:"Hide",summary:"Try to conceal yourself from enemies.",description:"<p>Use the Hide action when the situation gives you enough cover or concealment to attempt to become hidden. The exact check and result depend on the circumstances.</p>"},
  {name:"Influence",summary:"Try to change another creature's attitude or behaviour.",description:"<p>Use Influence when you try to persuade, deceive, intimidate, entertain, or otherwise affect another creature socially during a scene.</p>"},
  {name:"Magic",summary:"Cast an Action spell or use another magical effect.",description:"<p>The Magic action covers spells and other magical effects that require an Action. Your prepared Action spells are listed above this core reference.</p>"},
  {name:"Ready",summary:"Prepare an action to trigger later.",description:"<p>Choose an action you will take in response to a perceivable trigger before the start of your next turn. When the trigger occurs, you can use your Reaction to carry out the readied action.</p>"},
  {name:"Search",summary:"Look for something that is difficult to notice.",description:"<p>Use Search to deliberately look for a hidden creature, object, clue, or other detail that may require a Wisdom-based check.</p>"},
  {name:"Study",summary:"Recall or work out useful information.",description:"<p>Use Study to draw on your knowledge or reason something out, usually through an Intelligence-based check appropriate to the subject.</p>"},
  {name:"Utilize",summary:"Use an object that requires an Action.",description:"<p>Use Utilize when operating or manipulating an object requires your Action rather than a simple interaction.</p>"}
];

const CORE_OTHER_OPTIONS=[
  {name:"Move",summary:"Move up to your available Speed during your turn.",description:"<p>You can split your movement before, between, and after the other things you do on your turn, up to the movement you have available.</p>"},
  {name:"Stand Up",summary:"Spend half your Speed to stand from Prone.",description:"<p>Standing up from the Prone condition costs movement equal to half your Speed.</p>"},
  {name:"Jump",summary:"Make a Long Jump or High Jump when movement allows.",description:"<p>Jumping uses your movement. Your Strength and whether you have a running start affect how far or high you can jump.</p>"},
  {name:"Drop Prone",summary:"You can drop Prone without using an Action.",description:"<p>You can voluntarily drop to the ground and gain the Prone condition without spending an Action.</p>"},
  {name:"Simple Object Interaction",summary:"Handle a simple nearby object when reasonable.",description:"<p>Simple interactions such as drawing or stowing something can often be combined with movement or another activity. More involved object use can require the Utilize action.</p>"},
  {name:"End Concentration",summary:"Stop concentrating whenever you choose.",description:"<p>If you are concentrating on a spell or effect, you can choose to end your concentration without spending an Action.</p>"}
];

function stripActionHtml(html){
  const node=document.createElement("div");
  node.innerHTML=String(html||"");
  return (node.textContent||node.innerText||"").replace(/\s+/g," ").trim();
}
function actionBucketFromSpellTime(time){
  const t=String(time||"").toLowerCase();
  if(t.includes("reaction")) return "reaction";
  if(t.includes("bonus action")) return "bonus";
  if(t==="action" || t==="1 action" || /(^|\s)action(\s|$)/.test(t)) return "action";
  return null;
}
function actionBucketsFromDescription(html){
  const t=stripActionHtml(html).toLowerCase();
  const out=[];
  if(/\bbonus action\b/.test(t)) out.push("bonus");
  if(/\breaction\b/.test(t)) out.push("reaction");
  if(/\bmagic action\b|\bas an action\b|\btake an action\b|\buse your action\b|\baction to\b/.test(t)) out.push("action");
  return [...new Set(out)];
}
function actionGroupTitle(bucket){
  return ({action:"Actions",bonus:"Bonus Actions",reaction:"Reactions",other:"Movement & Other"})[bucket]||"Actions";
}
function actionBadge(bucket){
  return ({action:"ACTION",bonus:"BONUS ACTION",reaction:"REACTION",other:"OTHER"})[bucket]||"";
}
function actionRowHtml(entry,bucket){
  const tags=[actionBadge(bucket),...(entry.tags||[])].filter(Boolean);
  const key=actionFavouriteKey(entry,bucket);
  const favourite=(current().favouriteActions||[]).includes(key);
  return `<div class="possible-action-row-wrap"><button type="button" class="possible-action-row ${entry.standard?"standard-action":"character-action"}">
    <span class="possible-action-main">
      <strong>${escapeHtml(entry.name)}</strong>
      <span class="muted small">${escapeHtml(entry.summary||"")}</span>
      <span class="possible-action-tags">${tags.map(t=>`<span class="mini-tag">${escapeHtml(t)}</span>`).join("")}</span>
    </span>
    <span class="possible-action-chevron">›</span>
  </button><button type="button" class="action-favourite-btn ${favourite?"active":""}" data-favourite-key="${escapeHtml(encodeURIComponent(key))}" aria-label="${favourite?"Remove from":"Add to"} favourites">${favourite?"★":"☆"}</button></div>`;
}
function actionFavouriteKey(entry,bucket){
  return [bucket,entry.openSpell?.id||"",entry.openResource?.autoKey||entry.openResource?.name||"",entry.openItem||"",entry.name||""].join("|").toLowerCase();
}
function toggleActionFavourite(key){
  const list=current().favouriteActions||(current().favouriteActions=[]);
  const index=list.indexOf(key);
  if(index>=0) list.splice(index,1); else list.push(key);
  renderAll();
}
function openActionDetail(entry,bucket){
  if(entry.openSpell){ showAuroraSpell(entry.openSpell.id,entry.openSpell.name); return; }
  if(entry.openResource){ showAuroraResourceDetails(entry.openResource); return; }
  if(entry.openItem){ showInventoryItemDetails(entry.openItem); return; }

  q("#actionDetailName").textContent=entry.name||"Action";
  q("#actionDetailSource").textContent=entry.source||"";
  const tags=[actionGroupTitle(bucket),...(entry.tags||[])].filter(Boolean);
  q("#actionDetailMeta").innerHTML=tags.map(t=>`<span class="mini-tag">${escapeHtml(t)}</span>`).join("");
  q("#actionDetailDescription").innerHTML=entry.description||`<p>${escapeHtml(entry.summary||"No additional details.")}</p>`;
  q("#actionDetailDialog").showModal();
}
function uniquePossibleActions(entries){
  const seen=new Set();
  return entries.filter(x=>{
    const key=[x.name,x.summary,x.openSpell?.id||"",x.openResource?.autoKey||x.openResource?.name||"",x.openItem||"",x.standard?"standard":"specific"].join("|").toLowerCase();
    if(seen.has(key)) return false;
    seen.add(key); return true;
  });
}
function buildPossibleActions(){
  const c=current();
  const a=c?.aurora;
  const groups={action:[],bonus:[],reaction:[],other:[]};

  // Aurora's character-sheet attacks are the most useful combat-specific entries.
  for(const atk of (a?.attacks||[])){
    const bits=[];
    if(atk.attack) bits.push(`To hit ${atk.attack}`);
    if(atk.damage) bits.push(`Damage ${atk.damage}`);
    if(atk.range) bits.push(atk.range);
    groups.action.push({
      name:(atk.name||"Attack").replace(/[.\s]+$/,""),
      summary:bits.join(" • ")||"Aurora attack",
      source:"Aurora character sheet",
      tags:["ATTACK"],
      description:`<p>${escapeHtml(bits.join(" • ")||"Attack")}</p>${atk.description?`<p>${escapeHtml(atk.description).replace(/\n/g,"<br>")}</p>`:""}`
    });
  }

  // Equipped weapons that Aurora exposes as inventory items.
  for(const it of inventoryFor(c)||[]){
    const base=itemDef(it.id);
    if(!it.equipped || base?.elementType!=="Weapon") continue;
    const display=itemDisplayDef(it)||base;
    groups.action.push({
      name:`Attack — ${inventoryTitle(it)}`,
      summary:["Equipped weapon",display?.source||base?.source||""].filter(Boolean).join(" • "),
      source:display?.source||base?.source||"Aurora inventory",
      tags:["WEAPON"],
      openItem:it.identifier
    });
  }

  // Only prepared/known/always-available spells are valid session options.
  const spells=[...(a?.cantrips||[]),...(a?.allSpells||[])]
    .filter(s=>Number(s.level)===0 || s.prepared || s.alwaysPrepared || s.known);
  for(const s of spells){
    const def=window.AURORA_SPELLS?.[s.id];
    if(!def){
      groups.other.push({
        name:s.name,
        summary:`${Number(s.level)===0?"Cantrip":`Level ${s.level} spell`} • Details not bundled in the web edition`,
        source:"Imported character file",
        tags:["SPELL","IMPORTED"],
        description:"<p>This spell was identified from your locally imported character file. Its full rules text is not distributed with the public web edition.</p>"
      });
      continue;
    }
    const bucket=actionBucketFromSpellTime(def.time);
    if(!bucket) continue;
    const bits=[Number(s.level)===0?"Cantrip":`Level ${s.level} spell`];
    if(def.range) bits.push(def.range);
    if(def.concentration) bits.push("Concentration");
    const free=(c.resources||[]).find(r=>r.resourceKind==="freecast-spell" && r.spellId===s.id);
    if(free) bits.push(Number(free.current)>0?"Free cast available":"Free cast used");
    if(Number(s.level)>0){
      const pact=window.DND_REST_RULES.getPactMagicInfo(c);
      if(pact.exclusive && pact.slotLevel>=Number(s.level)){
        const slot=c.spellSlots?.[pact.slotLevel];
        if(slot && Number(slot.max)>0) bits.push(`${Math.max(0,Number(slot.max)-Number(slot.used))}/${slot.max} Pact slots (L${pact.slotLevel})`);
      }else{
        const slot=c.spellSlots?.[s.level];
        if(slot && Number(slot.max)>0) bits.push(`${Math.max(0,Number(slot.max)-Number(slot.used))}/${slot.max} L${s.level} slots`);
      }
    }
    groups[bucket].push({
      name:s.name,
      summary:bits.join(" • "),
      source:def.source||"Aurora spell",
      tags:["SPELL"],
      openSpell:{id:s.id,name:s.name}
    });
  }

  // Free-cast spells can come from feats/features without being part of the class spell list.
  const listedSpellIds=new Set(spells.map(s=>s.id).filter(Boolean));
  for(const r of (c.resources||[]).filter(x=>x.resourceKind==="freecast-spell" && x.spellId && !listedSpellIds.has(x.spellId))){
    const def=window.AURORA_SPELLS?.[r.spellId];
    const bucket=actionBucketFromSpellTime(def?.time);
    if(!def || !bucket) continue;
    const level=Number(def.level)||0;
    const bits=[level===0?"Cantrip":`Level ${level} spell`,def.range||"",Number(r.current)>0?"Free cast available":"Free cast used"].filter(Boolean);
    if(def.concentration) bits.push("Concentration");
    groups[bucket].push({
      name:def.name||r.name,
      summary:bits.join(" • "),
      source:def.source||r.source||"Aurora feature",
      tags:["SPELL","FREE CAST"],
      openSpell:{id:r.spellId,name:def.name||r.name}
    });
  }

  // Aurora resources that clearly state an action economy are useful here too.
  for(const r of (c.resources||[])){
    if(r.resourceKind==="freecast-spell") continue;
    const featureId=r.featureId || (String(r.autoKey||"").startsWith("aurora:")?String(r.autoKey).split(":")[1]:null);
    const def=window.AURORA_RESOURCE_DEFS?.[featureId];
    if(!def) continue;
    const description=resourceDescriptionHtml(def,a);
    for(const bucket of actionBucketsFromDescription(description)){
      groups[bucket].push({
        name:r.name,
        summary:`${r.current}/${r.max} available • ${resourceRecoveryLabel(r)}`,
        source:def.source||r.source||"Aurora feature",
        tags:["FEATURE"],
        openResource:r
      });
    }
  }

  // Carried magic items can expose their own Actions / Bonus Actions / Reactions.
  for(const it of inventoryFor(c)||[]){
    const def=itemDisplayDef(it)||itemDef(it.id);
    if(!def?.description) continue;
    for(const bucket of actionBucketsFromDescription(def.description)){
      groups[bucket].push({
        name:inventoryTitle(it),
        summary:[def.rarity,def.itemType||def.elementType,it.equipped?"Equipped":"Carried"].filter(Boolean).join(" • "),
        source:def.source||"Aurora item",
        tags:["ITEM"],
        openItem:it.identifier
      });
    }
  }

  // Some current companions explicitly require no owner action to command.
  for(const comp of currentCompanions()){
    if(comp.presetType==="homunculus"){
      groups.other.push({
        name:`Command ${comp.name}`,
        summary:"No action required by you",
        source:"Homunculus Servant",
        tags:["COMPANION"],
        description:"<p>Your Homunculus Servant acts immediately after your turn and obeys your commands. Issuing those commands does not require an Action from you.</p>"
      });
    }else if(comp.presetType==="chain"){
      const calc=companionComputed(comp);
      if(calc.investment){
        groups.bonus.push({
          name:`Command ${comp.name} to attack`,
          summary:"Investment of the Chain Master",
          source:"Pact of the Chain",
          tags:["COMPANION"],
          description:`<p>You can use a Bonus Action to command ${escapeHtml(comp.name)} to take the Attack action.</p>`
        });
      }
      groups.other.push({
        name:`Pact Familiar — ${comp.name}`,
        summary:"You can forgo one of your attacks to let the familiar attack",
        source:"Pact of the Chain",
        tags:["COMPANION"],
        description:`<p>You can forgo one of your attacks when you take the Attack action to allow ${escapeHtml(comp.name)} to make one attack using its Reaction.</p>`
      });
    }
  }

  // Core references remain at the bottom of the relevant sections.
  for(const x of CORE_ACTIONS_2024) groups.action.push({...x,source:"Core combat reference (2024)",tags:["CORE"],standard:true});
  groups.reaction.push({
    name:"Opportunity Attack",
    summary:"React when a creature leaves your reach without safely disengaging.",
    source:"Core combat reference (2024)",tags:["CORE"],standard:true,
    description:"<p>When a creature you can see leaves your reach in a way that provokes an Opportunity Attack, you can use your Reaction to make one melee attack against it.</p>"
  });
  for(const x of CORE_OTHER_OPTIONS) groups.other.push({...x,source:"Core combat reference (2024)",tags:["CORE"],standard:true});

  for(const key of Object.keys(groups)){
    const unique=uniquePossibleActions(groups[key]);
    const specific=unique.filter(x=>!x.standard).sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),undefined,{sensitivity:"base"}));
    const standard=unique.filter(x=>x.standard);
    groups[key]=[...specific,...standard];
  }
  return groups;
}
function renderActions(){
  const c=current();
  const box=q("#actionsList");
  if(!box) return;
  const a=c?.aurora;
  q("#actionsCharacterMeta").textContent=a
    ? `${a.name||c.name} • ${a.className||"Character"}${a.subclass?" — "+a.subclass:""} • Level ${a.level||"—"}`
    : `${c?.name||"Character"} • Core combat reference`;

  const linked=encounter().combatants.find(x=>x.linkedCharacterId===c?.id);
  const turn=q("#actionsTurnContext");
  if(linked && encounter().currentId===linked.id){
    turn.classList.remove("hidden");
    turn.innerHTML=`<strong>Your turn</strong><span>Round ${escapeHtml(String(encounter().round||1))}</span>${linked.concentration?`<span>Concentrating: ${escapeHtml(linked.concentration)}</span>`:""}`;
  }else if(linked?.concentration){
    turn.classList.remove("hidden");
    turn.innerHTML=`<strong>Concentration</strong><span>${escapeHtml(linked.concentration)}</span>`;
  }else{
    turn.classList.add("hidden");
    turn.innerHTML="";
  }

  renderCompactEffectsSummary("#actionsEffectsSummary");

  const groups=buildPossibleActions();
  q("#actionsActionCount").textContent=`${groups.action.length} Actions`;
  q("#actionsBonusCount").textContent=`${groups.bonus.length} Bonus`;
  q("#actionsReactionCount").textContent=`${groups.reaction.length} Reactions`;

  const order=["action","bonus","reaction","other"];
  box.innerHTML=order.map(bucket=>{
    const entries=groups[bucket];
    const specific=entries.filter(x=>!x.standard);
    const standard=entries.filter(x=>x.standard);
    const rows=(arr)=>arr.map(x=>actionRowHtml(x,bucket)).join("");
    const empty=bucket==="bonus"
      ? '<div class="action-empty muted small">No character-specific Bonus Actions were detected.</div>'
      : '<div class="action-empty muted small">No character-specific options detected here.</div>';
    return `<section class="card action-section" data-action-section="${bucket}">
      <div class="card-head action-section-head"><h2>${actionGroupTitle(bucket)}</h2><span class="pill">${entries.length}</span></div>
      ${specific.length?`<div class="action-subheading">Character</div><div class="possible-action-list">${rows(specific)}</div>`:empty}
      ${standard.length?`<div class="action-subheading core-subheading">Core reference</div><div class="possible-action-list core-action-list">${rows(standard)}</div>`:""}
    </section>`;
  }).join("");

  order.forEach(bucket=>{
    const entries=groups[bucket];
    const section=box.querySelector(`[data-action-section="${bucket}"]`);
    const rows=[...section.querySelectorAll(".possible-action-row")];
    // Rows are emitted as specific followed by standard, matching this array order.
    rows.forEach((row,i)=>row.onclick=()=>openActionDetail(entries[i],bucket));
    section.querySelectorAll(".action-favourite-btn").forEach(btn=>btn.onclick=e=>{
      e.stopPropagation(); toggleActionFavourite(decodeURIComponent(btn.dataset.favouriteKey));
    });
  });
}

q("#actionDetailClose").onclick=()=>q("#actionDetailDialog").close();

function goToTab(tab){
  state.activeTab=tab;
  renderAll();
  window.scrollTo({top:0,behavior:"smooth"});
}
function quickPlayAllActions(){
  const groups=buildPossibleActions();
  return Object.entries(groups).flatMap(([bucket,entries])=>entries.map(entry=>({entry,bucket,key:actionFavouriteKey(entry,bucket)})));
}
function renderQuickPlay(){
  const c=current();
  const a=c.aurora;
  q("#quickPlayName").textContent=c.name||"Character";
  q("#quickPlayMeta").textContent=a
    ? [a.race,a.className,a.subclass?`— ${a.subclass}`:"",a.level?`Level ${a.level}`:""].filter(Boolean).join(" • ")
    : "Local character";

  const ac=armorClassInfo(c);
  const vital=(selector,label,value,sub)=>{
    q(selector).innerHTML=`<span class="quick-play-label">${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong><small>${escapeHtml(sub||"")}</small>`;
  };
  vital("#quickPlayHp","Hit Points",`${c.hp.current} / ${c.hp.max}`,c.hp.current<=0?"Down":`${c.hp.max?Math.round(c.hp.current/c.hp.max*100):0}% remaining`);
  vital("#quickPlayAc","Armor Class",ac.available?ac.total:"—",ac.available?armorClassBreakdownText(ac):"Import Aurora to calculate");
  vital("#quickPlayTempHp","Temporary HP",c.hp.temp||0,c.hp.temp?"Active":"None");
  vital("#quickPlayInspiration","Inspiration",c.inspiration?"Ready":"Not held",c.inspiration?"Tap to remove":"Tap to gain");

  const concentration=window.DND_EFFECTS?.getConcentration(c);
  const effects=window.DND_EFFECTS?.getEffects(c)||[];
  q("#quickPlayEffects").innerHTML=(concentration||effects.length)
    ? `${concentration?`<button class="quick-play-effect concentration" data-effect-id="${escapeHtml(concentration.id)}"><span>Concentration</span><strong>${escapeHtml(concentration.name)}</strong></button>`:""}${effects.filter(e=>e.id!==concentration?.id).slice(0,4).map(e=>`<button class="quick-play-effect" data-effect-id="${escapeHtml(e.id)}"><strong>${escapeHtml(e.name)}</strong><small>${escapeHtml(effectDurationLabel(e))}</small></button>`).join("")}`
    : '<div class="quick-play-empty">No active effects or concentration.</div>';
  q("#quickPlayEffects").querySelectorAll("[data-effect-id]").forEach(btn=>btn.onclick=()=>showEffectDetails(btn.dataset.effectId));

  const slots=Object.entries(c.spellSlots||{}).filter(([,slot])=>Number(slot.max)>0);
  const pact=window.DND_REST_RULES?.getPactMagicInfo(c)||{exclusive:false,slotLevel:0};
  q("#quickPlaySlots").innerHTML=slots.length?slots.map(([level,slot])=>{
    const left=Math.max(0,Number(slot.max)-Number(slot.used));
    return `<button class="quick-play-slot" data-slot-level="${level}" type="button"><span>${pact.exclusive&&Number(level)===pact.slotLevel?"Pact Magic":`Level ${level}`}</span><strong>${"●".repeat(left)}${"○".repeat(Math.max(0,Number(slot.max)-left))}</strong><small>${left}/${slot.max}</small></button>`;
  }).join(""):'<div class="quick-play-empty">No spell slots configured.</div>';
  q("#quickPlaySlots").querySelectorAll("[data-slot-level]").forEach(btn=>btn.onclick=()=>goToTab("character"));

  q("#quickPlayResources").innerHTML=c.resources.length?c.resources.slice(0,8).map((r,i)=>`<div class="quick-play-resource"><button class="quick-play-resource-main" data-resource-open="${i}" type="button"><strong>${escapeHtml(r.name)}</strong><small>${escapeHtml(resourceRecoveryLabel(r))}</small></button><button class="secondary quick-resource-use" data-resource-use="${i}" type="button">${Number(r.current)>0?"Use":"Restore"}</button><span>${r.current}/${r.max}</span></div>`).join(""):'<div class="quick-play-empty">No limited-use resources.</div>';
  q("#quickPlayResources").querySelectorAll("[data-resource-open]").forEach(btn=>btn.onclick=()=>{
    const r=c.resources[Number(btn.dataset.resourceOpen)];
    if(r.resourceKind==="freecast-spell"&&r.spellId) showAuroraSpell(r.spellId,r.name.replace(/\s*\(Free Cast\)\s*$/i,""));
    else if(r.featureId) showAuroraResourceDetails(r);
    else goToTab("character");
  });
  q("#quickPlayResources").querySelectorAll("[data-resource-use]").forEach(btn=>btn.onclick=()=>{
    const r=c.resources[Number(btn.dataset.resourceUse)];
    if(Number(r.current)>0) r.current=Math.max(0,Number(r.current)-1); else r.current=Number(r.max);
    renderAll();
  });

  const conditions=window.DND_EFFECTS?.getConditions(c)||[];
  q("#quickPlayConditions").innerHTML=conditions.length?conditions.map(e=>`<button class="quick-play-condition" data-effect-id="${escapeHtml(e.id)}" type="button"><strong>${escapeHtml(e.conditionName)}</strong><small>${escapeHtml(e.summary||"")}</small></button>`).join(""):'<button class="quick-play-empty-button" data-quick-tab="effects" type="button">No conditions — tap to manage</button>';
  q("#quickPlayConditions").querySelectorAll("[data-effect-id]").forEach(btn=>btn.onclick=()=>showEffectDetails(btn.dataset.effectId));

  const favs=new Set(c.favouriteActions||[]);
  const actions=quickPlayAllActions().filter(x=>favs.has(x.key));
  q("#quickPlayFavourites").innerHTML=actions.length?actions.map((x,i)=>`<button class="quick-play-favourite" data-favourite-index="${i}" type="button"><strong>${escapeHtml(x.entry.name)}</strong><small>${escapeHtml(actionBadge(x.bucket))}${x.entry.summary?` • ${escapeHtml(x.entry.summary)}`:""}</small></button>`).join(""):'<button class="quick-play-empty-button" data-quick-tab="actions" type="button">No favourites yet — star actions to add them here</button>';
  q("#quickPlayFavourites").querySelectorAll("[data-favourite-index]").forEach(btn=>btn.onclick=()=>{const x=actions[Number(btn.dataset.favouriteIndex)];openActionDetail(x.entry,x.bucket);});

  const activeCount=(window.DND_EFFECTS?.getConditions(c)||[]).length+(window.DND_EFFECTS?.getEffects(c)||[]).length;
  const companionCount=(state.companions||[]).filter(x=>x.ownerCharacterId===c.id).length;
  q("#moreEffectsMeta").textContent=activeCount?`${activeCount} active condition${activeCount===1?" / effect":"s / effects"}`:"No active conditions or effects";
  q("#moreCompanionsMeta").textContent=companionCount?`${companionCount} active companion${companionCount===1?"":"s"}`:"No active companions";
  q("#moreTabBadge").textContent=activeCount||"";
  q("#moreTabBadge").classList.toggle("hidden",!activeCount);

  q("#quickPlayPage").querySelectorAll("[data-quick-tab]").forEach(btn=>btn.onclick=()=>goToTab(btn.dataset.quickTab));
}


function renderAppPage(){
  const tab=state.activeTab||"quickplay";
  q("#quickPlayPage").classList.toggle("hidden",tab!=="quickplay");
  q("#characterPage").classList.toggle("hidden",tab!=="character");
  q("#actionsPage").classList.toggle("hidden",tab!=="actions");
  q("#effectsPage").classList.toggle("hidden",tab!=="effects");
  q("#inventoryPage").classList.toggle("hidden",tab!=="inventory");
  q("#companionsPage").classList.toggle("hidden",tab!=="companions");
  q("#notesPage").classList.toggle("hidden",tab!=="notes");
  q("#encounterPage").classList.toggle("hidden",tab!=="encounter");
  q("#quickPlayTabBtn").classList.toggle("active",tab==="quickplay");
  q("#actionsTabBtn").classList.toggle("active",tab==="actions");
  q("#notesTabBtn").classList.toggle("active",tab==="notes");
  q("#encounterTabBtn").classList.toggle("active",tab==="encounter");
  q("#moreTabBtn").classList.toggle("active",["character","effects","inventory","companions"].includes(tab));
}

function encounter(){
  if(!state.encounter) state.encounter=defaultEncounter();
  return state.encounter;
}

function sortEncounterCombatants(){
  const enc=encounter();
  const current=enc.currentId;
  for(const combatant of enc.combatants){
    const comp=linkedCompanion(combatant);
    if(!comp || !companionSharesOwnerInitiative(comp)) continue;
    const ownerRow=enc.combatants.find(x=>x.linkedCharacterId===comp.ownerCharacterId);
    if(ownerRow) combatant.initiative=ownerRow.initiative;
  }
  enc.combatants.sort((a,b)=>{
    const init=Number(b.initiative)-Number(a.initiative);
    if(init) return init;
    const ac=linkedCompanion(a), bc=linkedCompanion(b);
    if(ac && b.linkedCharacterId===ac.ownerCharacterId) return 1;
    if(bc && a.linkedCharacterId===bc.ownerCharacterId) return -1;
    return a.name.localeCompare(b.name);
  });
  if(current && enc.combatants.some(c=>c.id===current)) enc.currentId=current;
  else enc.currentId=enc.combatants[0]?.id || null;
}

function syncEncounterOpeningTurn(){
  const enc=encounter();
  if(enc.turnStarted || Number(enc.round)!==1) return;
  enc.currentId=enc.combatants[0]?.id || null;
}

function getOpenCombatant(){
  return encounter().combatants.find(c=>c.id===openCombatantId) || null;
}

function linkedCharacter(combatant){
  if(!combatant?.linkedCharacterId) return null;
  return state.characters.find(c=>c.id===combatant.linkedCharacterId) || null;
}
function linkedCompanion(combatant){
  if(!combatant?.linkedCompanionId) return null;
  return getCompanion(combatant.linkedCompanionId);
}

function encounterStatusLabel(status){
  return ({normal:"Normal",bloodied:"Bloodied",down:"Down",defeated:"Defeated"})[status] || "Normal";
}

function renderEncounter(){
  const enc=encounter();
  sortEncounterCombatants();
  syncEncounterOpeningTurn();

  q("#encounterRound").textContent=enc.round;
  q("#combatantCount").textContent=String(enc.combatants.length);

  const currentCombatant=enc.combatants.find(c=>c.id===enc.currentId);
  q("#encounterCurrentName").textContent=currentCombatant?.name || "No combatants";

  const list=q("#encounterList");
  if(!enc.combatants.length){
    list.innerHTML=`<div class="empty-encounter">
      <strong>No combatants yet.</strong>
      <div class="muted small top-space">Add your character or another participant to start tracking initiative.</div>
    </div>`;
    q("#previousTurnBtn").disabled=true;
    q("#nextTurnBtn").disabled=true;
  }else{
    q("#previousTurnBtn").disabled=false;
    q("#nextTurnBtn").disabled=false;

    list.innerHTML=enc.combatants.map(c=>{
      const isCurrent=c.id===enc.currentId;
      const linked=linkedCharacter(c);
      const minion=linkedCompanion(c);
      const badges=[];
      if(linked) badges.push("Your Character");
      else if(minion){
        const owner=companionOwner(minion);
        badges.push("Your Companion");
        if(owner) badges.push(owner.name);
      }else badges.push(c.type==="enemy"?"Enemy":c.type==="ally"?"Ally":"Neutral");
      if(c.status!=="normal") badges.push(encounterStatusLabel(c.status));
      (c.conditions||[]).forEach(x=>badges.push(x));
      if(c.concentration) badges.push(`Concentrating: ${c.concentration}`);

      return `<div class="encounter-row ${isCurrent?"current":""}" data-combatant-id="${escapeHtml(c.id)}">
        <div class="initiative-badge">${escapeHtml(String(c.initiative))}</div>
        <div class="combatant-main">
          <div class="combatant-name">${escapeHtml(c.name)}</div>
          <div class="combatant-meta">${badges.slice(0,5).map(x=>`<span class="mini-tag">${escapeHtml(x)}</span>`).join("")}</div>
          ${isCurrent?'<div class="turn-arrow top-space">CURRENT TURN</div>':""}
        </div>
        <div class="damage-readout">
          <span class="muted small">${linked||minion?"HP":"Damage"}</span>
          <strong>${
            linked
              ? `${linked.hp.current}/${linked.hp.max}${linked.hp.temp?` +${linked.hp.temp} temp`:""}`
              : minion
                ? `${minion.hp.current}/${minion.hp.max}${minion.hp.temp?` +${minion.hp.temp} temp`:""}`
                : Math.max(0,Number(c.damageTaken)||0)
          }</strong>
        </div>
      </div>`;
    }).join("");

    list.querySelectorAll("[data-combatant-id]").forEach(row=>{
      row.onclick=()=>openCombatantDetail(row.dataset.combatantId);
    });
  }
renderEncounterRosterPicker();
}

function goToEncounterTurn(direction){
  const enc=encounter();
  sortEncounterCombatants();
  syncEncounterOpeningTurn();
  if(!enc.combatants.length) return;

  enc.turnStarted=true;

  let idx=enc.combatants.findIndex(c=>c.id===enc.currentId);
  if(idx<0) idx=0;

  if(direction>0){
    idx++;
    if(idx>=enc.combatants.length){
      idx=0;
      enc.round++;
    }
  }else{
    idx--;
    if(idx<0){
      idx=enc.combatants.length-1;
      enc.round=Math.max(1,enc.round-1);
    }
  }

  enc.currentId=enc.combatants[idx].id;
  if(direction>0){
    const arriving=enc.combatants[idx];
    if(arriving?.linkedCharacterId){
      const owner=state.characters.find(x=>x.id===arriving.linkedCharacterId);
      if(owner){
        window.DND_EFFECTS?.processOwnerTurnStart(owner,encounterTurnKey(owner));
        syncCharacterEffectsToEncounter(owner);
      }
    }
  }
  renderAll();
}

function addCurrentCharacterToEncounter(){
  const c=current();
  const enc=encounter();
  if(enc.combatants.some(x=>x.linkedCharacterId===c.id)) return;

  const initiativeText=prompt(`Initiative for ${c.name}:`,"10");
  if(initiativeText===null) return;
  const initiative=Number(initiativeText);
  if(!Number.isFinite(initiative)) return;

  const combatant={
    id:crypto.randomUUID ? crypto.randomUUID() : String(Date.now()+Math.random()),
    name:c.name,
    initiative,
    type:"ally",
    linkedCharacterId:c.id,
    linkedCompanionId:null,
    damageTaken:0,
    damageHistory:[],
    status:"normal",
    conditions:[],
    concentration:"",
    notes:""
  };

  enc.combatants.push(combatant);
  sortEncounterCombatants();
  syncEncounterOpeningTurn();
  if(!enc.currentId) enc.currentId=combatant.id;
  renderEncounter();
  saveState();
}

function openCombatantDetail(id){
  const c=encounter().combatants.find(x=>x.id===id);
  if(!c) return;
  openCombatantId=id;

  q("#combatantDetailName").textContent=c.name;
  const linked=linkedCharacter(c);
  const minion=linkedCompanion(c);
  const minionOwner=minion?companionOwner(minion):null;
  q("#combatantDetailSub").textContent=linked ? `Linked to ${linked.name}` : minion ? `Companion of ${minionOwner?.name||"character"}` : encounterStatusLabel(c.status);
  const ownedHp=linked?.hp||minion?.hp||null;
  q("#combatantDamageLabel").textContent=ownedHp?"CURRENT HIT POINTS":"OBSERVED DAMAGE TAKEN";
  q("#combatantDamageInputLabel").textContent=ownedHp?"Amount":"Damage";
  q("#combatantDamageTotal").textContent=ownedHp
    ? `${ownedHp.current} / ${ownedHp.max}${ownedHp.temp?` (+${ownedHp.temp} temp)`:""}`
    : String(c.damageTaken||0);
  q("#healCombatantCompanionBtn").classList.toggle("hidden",!ownedHp);
  q("#combatantDamageInput").value=1;
  q("#editCombatantInitiative").value=c.initiative;
  q("#combatantStatus").value=c.status || "normal";
  q("#combatantConcentration").value=c.concentration || "";
  q("#combatantNotes").value=c.notes || "";

  const box=q("#combatantConditions");
  box.innerHTML=ENCOUNTER_CONDITIONS.map(cond=>{
    const checked=(c.conditions||[]).includes(cond);
    return `<label class="condition-chip">
      <input type="checkbox" value="${escapeHtml(cond)}" ${checked?"checked":""} />
      <span>${escapeHtml(cond)}</span>
    </label>`;
  }).join("");

  q("#undoCombatantDamageBtn").disabled=!(c.damageHistory||[]).length;
  q("#combatantDetailDialog").showModal();
}

function rerenderOpenCombatant(){
  const id=openCombatantId;
  renderEncounter();
  if(id) openCombatantDetail(id);
}

function applyObservedDamage(amount){
  const c=getOpenCombatant();
  if(!c) return;
  amount=Math.max(0,Math.floor(Number(amount)||0));
  if(!amount) return;

  const linked=linkedCharacter(c);
  const minion=linkedCompanion(c);
  const event={
    kind:"damage",
    amount,
    at:new Date().toISOString(),
    linkedBefore: linked ? {hp:linked.hp.current,temp:linked.hp.temp} : null,
    companionBefore: minion ? {hp:minion.hp.current,temp:minion.hp.temp} : null
  };

  c.damageTaken=(Number(c.damageTaken)||0)+amount;
  c.damageHistory=c.damageHistory||[];
  c.damageHistory.push(event);

  if(minion){
    if(minion.hp.temp>0){
      const absorb=Math.min(minion.hp.temp,amount);
      minion.hp.temp-=absorb;
      minion.hp.current=clamp(minion.hp.current-(amount-absorb),0,minion.hp.max);
    }else{
      minion.hp.current=clamp(minion.hp.current-amount,0,minion.hp.max);
    }
    if(minion.hp.current===0 && c.status==="normal") c.status="down";
  }else if(linked){
    // Apply the same observed damage to the real tracker character, including Temp HP.
    if(linked.hp.temp>0){
      const absorb=Math.min(linked.hp.temp,amount);
      linked.hp.temp-=absorb;
      linked.hp.current=clamp(linked.hp.current-(amount-absorb),0,linked.hp.max);
    }else{
      linked.hp.current=clamp(linked.hp.current-amount,0,linked.hp.max);
    }
  }

  const ownedHpAfter=linked?.hp||minion?.hp||null;
  q("#combatantDamageTotal").textContent=ownedHpAfter
    ? `${ownedHpAfter.current} / ${ownedHpAfter.max}${ownedHpAfter.temp?` (+${ownedHpAfter.temp} temp)`:""}`
    : String(c.damageTaken);
  q("#undoCombatantDamageBtn").disabled=false;

  // Linked characters use the exact same HP object as the Character tab,
  // so damage in Encounter is immediately reflected there.
  if(linked && linked.hp.current===0 && c.status==="normal") c.status="down";
  if(linked && linked.hp.current>0 && c.status==="down") c.status="normal";

  renderAll();
}

function undoObservedDamage(){
  const c=getOpenCombatant();
  if(!c?.damageHistory?.length) return;

  const event=c.damageHistory.pop();
  c.damageTaken=Math.max(0,(Number(c.damageTaken)||0)-Number(event.amount||0));

  const linked=linkedCharacter(c);
  const minion=linkedCompanion(c);
  if(linked && event.linkedBefore){
    linked.hp.current=clamp(Number(event.linkedBefore.hp)||0,0,linked.hp.max);
    linked.hp.temp=Math.max(0,Number(event.linkedBefore.temp)||0);
  }
  if(minion && event.companionBefore){
    minion.hp.current=clamp(Number(event.companionBefore.hp)||0,0,minion.hp.max);
    minion.hp.temp=Math.max(0,Number(event.companionBefore.temp)||0);
  }

  const ownedHpAfter=linked?.hp||minion?.hp||null;
  q("#combatantDamageTotal").textContent=ownedHpAfter
    ? `${ownedHpAfter.current} / ${ownedHpAfter.max}${ownedHpAfter.temp?` (+${ownedHpAfter.temp} temp)`:""}`
    : String(c.damageTaken);
  q("#undoCombatantDamageBtn").disabled=!c.damageHistory.length;

  if(linked && linked.hp.current===0 && c.status==="normal") c.status="down";
  if(linked && linked.hp.current>0 && c.status==="down") c.status="normal";
  if(minion && minion.hp.current===0 && c.status==="normal") c.status="down";
  if(minion && minion.hp.current>0 && c.status==="down") c.status="normal";

  renderAll();
}


function healLinkedCombatant(amount){
  const c=getOpenCombatant();
  if(!c) return;

  const linked=linkedCharacter(c);
  const minion=linkedCompanion(c);
  const target=linked||minion;
  if(!target?.hp) return;

  amount=Math.max(0,Math.floor(Number(amount)||0));
  if(!amount) return;

  c.damageHistory=c.damageHistory||[];
  c.damageHistory.push({
    kind:"heal",
    amount:0,
    at:new Date().toISOString(),
    linkedBefore: linked ? {hp:linked.hp.current,temp:linked.hp.temp} : null,
    companionBefore: minion ? {hp:minion.hp.current,temp:minion.hp.temp} : null
  });

  target.hp.current=clamp(target.hp.current+amount,0,target.hp.max);

  if(target.hp.current>0 && c.status==="down") c.status="normal";

  q("#combatantDamageTotal").textContent=
    `${target.hp.current} / ${target.hp.max}${target.hp.temp?` (+${target.hp.temp} temp)`:""}`;
  q("#undoCombatantDamageBtn").disabled=false;

  // Character and Encounter are two views over the same saved HP state.
  renderAll();
}

q("#quickPlayTabBtn").onclick=()=>goToTab("quickplay");
q("#actionsTabBtn").onclick=()=>{
  state.activeTab="actions";
  renderAll();
};
q("#notesTabBtn").onclick=()=>{
  state.activeTab="notes";
  renderAll();
};
q("#encounterTabBtn").onclick=()=>{
  state.activeTab="encounter";
  renderAll();
};
q("#moreTabBtn").onclick=()=>q("#moreMenuDialog").showModal();
q("#closeMoreMenuBtn").onclick=()=>q("#moreMenuDialog").close();
q("#moreMenuDialog").querySelectorAll("[data-more-tab]").forEach(btn=>btn.onclick=()=>{
  q("#moreMenuDialog").close(); goToTab(btn.dataset.moreTab);
});
q("#quickPlayCharacterBtn").onclick=()=>goToTab("character");
q("#quickPlayHp").onclick=()=>goToTab("character");
q("#quickPlayAc").onclick=()=>goToTab("character");
q("#quickPlayTempHp").onclick=()=>goToTab("character");
q("#quickPlayInspiration").onclick=()=>{current().inspiration=!current().inspiration;renderAll();};

q("#previousTurnBtn").onclick=()=>goToEncounterTurn(-1);
q("#nextTurnBtn").onclick=()=>goToEncounterTurn(1);
q("#cancelCombatantBtn").onclick=()=>q("#combatantDialog").close();

q("#addCombatantBtn").onclick=()=>{
  q("#combatantName").value="";
  q("#combatantInitiative").value="10";
  q("#combatantType").value="enemy";
  q("#combatantDialog").showModal();
};

q("#combatantForm").addEventListener("submit",e=>{
  if(e.submitter?.value==="cancel") return;
  e.preventDefault();

  const name=q("#combatantName").value.trim();
  const initiative=Number(q("#combatantInitiative").value);
  if(!name || !Number.isFinite(initiative)) return;

  const c={
    id:crypto.randomUUID ? crypto.randomUUID() : String(Date.now()+Math.random()),
    name,
    initiative,
    type:q("#combatantType").value,
    linkedCharacterId:null,
    linkedCompanionId:null,
    damageTaken:0,
    damageHistory:[],
    status:"normal",
    conditions:[],
    concentration:"",
    notes:""
  };
  encounter().combatants.push(c);
  sortEncounterCombatants();
  syncEncounterOpeningTurn();
  if(!encounter().currentId) encounter().currentId=c.id;
  q("#combatantDialog").close();
  renderEncounter();
  saveState();
});

q("#restartEncounterBtn").onclick=()=>{
  if(!encounter().combatants.length) return;
  sortEncounterCombatants();
  encounter().round=1;
  encounter().turnStarted=false;
  encounter().currentId=encounter().combatants[0]?.id || null;
  renderEncounter();
  saveState();
};

q("#clearEncounterBtn").onclick=()=>{
  if(!encounter().combatants.length) return;
  if(confirm("Clear the entire encounter? This removes initiative, observed damage and encounter-only notes/conditions. Character Active Effects remain with the character.")){
    state.encounter=defaultEncounter();
    renderEncounter();
    saveState();
  }
};

q("#closeCombatantDetailBtn").onclick=()=>q("#combatantDetailDialog").close();

q("#addCombatantDamageBtn").onclick=()=>{
  applyObservedDamage(q("#combatantDamageInput").value);
  q("#combatantDamageInput").value=1;
};
q("#healCombatantCompanionBtn").onclick=()=>{
  healLinkedCombatant(q("#combatantDamageInput").value);
  q("#combatantDamageInput").value=1;
};

q("#undoCombatantDamageBtn").onclick=undoObservedDamage;

q("#editCombatantInitiative").onchange=e=>{
  const c=getOpenCombatant();
  if(!c) return;
  c.initiative=Number(e.target.value)||0;
  sortEncounterCombatants();
  syncEncounterOpeningTurn();
  renderEncounter();
  saveState();
};

q("#combatantStatus").onchange=e=>{
  const c=getOpenCombatant();
  if(!c) return;
  c.status=e.target.value;
  renderEncounter();
  saveState();
};

q("#combatantConditions").onchange=()=>{
  const c=getOpenCombatant();
  if(!c) return;
  const selected=[...q("#combatantConditions").querySelectorAll("input:checked")].map(x=>x.value);
  const linked=linkedCharacter(c);
  if(linked && window.DND_EFFECTS){
    for(const name of Object.keys(window.DND_EFFECTS.CONDITION_DEFS)) window.DND_EFFECTS.setCondition(linked,name,selected.includes(name));
    syncCharacterEffectsToEncounter(linked);
    q("#combatantConcentration").value=c.concentration||"";
    renderAll();
  }else{
    c.conditions=selected;
    renderEncounter();
    saveState();
  }
};

q("#combatantConcentration").onchange=e=>{
  const c=getOpenCombatant();
  if(!c) return;
  const value=e.target.value.trim();
  const linked=linkedCharacter(c);
  if(linked && window.DND_EFFECTS){
    window.DND_EFFECTS.clearConcentration(linked);
    if(value) window.DND_EFFECTS.add(linked,{name:value,source:"Encounter",summary:`Concentrating on ${value}.`,description:`<p>You are concentrating on ${escapeHtml(value)}.</p>`,duration:"concentration",concentration:true,custom:true,createdTurnKey:encounterTurnKey(linked)});
    syncCharacterEffectsToEncounter(linked);
    renderAll();
  }else{
    c.concentration=value;
    renderEncounter();
    saveState();
  }
};

q("#combatantNotes").onchange=e=>{
  const c=getOpenCombatant();
  if(!c) return;
  c.notes=e.target.value;
  saveState();
};

q("#deleteCombatantBtn").onclick=()=>{
  const c=getOpenCombatant();
  if(!c) return;
  if(confirm(`Remove ${c.name} from the encounter?`)){
    encounter().combatants=encounter().combatants.filter(x=>x.id!==c.id);
    if(encounter().currentId===c.id){
      sortEncounterCombatants();
      encounter().currentId=encounter().combatants[0]?.id || null;
    }
    openCombatantId=null;
    q("#combatantDetailDialog").close();
    renderEncounter();
    saveState();
  }
};


function xmlText(parent, selector, fallback=""){
  const node=parent?.querySelector(selector);
  return node?.textContent?.trim() || fallback;
}
function intText(parent, selector, fallback=0){
  const n=Number(xmlText(parent,selector,""));
  return Number.isFinite(n)?n:fallback;
}
function titleFromAuroraId(id=""){
  const tail=id.split("_").filter(Boolean).pop() || "";
  return tail ? tail.charAt(0)+tail.slice(1).toLowerCase() : "";
}


function auroraIntValue(raw, ctx){
  if(raw===undefined || raw===null || raw==="") return 0;
  if(/^-?\d+$/.test(String(raw))) return Number(raw);
  const v=String(raw).trim().toLowerCase();
  if(v==="level") return Number(ctx.level||0);

  const mm=v.match(/^(strength|dexterity|constitution|intelligence|wisdom|charisma):modifier$/);
  if(mm){
    const score=Number(ctx.abilities?.[mm[1]]||10);
    return Math.floor((score-10)/2);
  }
  return 0;
}

function normalizeMulticlassClassId(id=""){
  return id.replace("_MULTICLASS_","_CLASS_");
}

function deriveAuroraClassLevels(doc){
  const levelNodes=[...doc.querySelectorAll("build > elements > element[type='Level']")];
  if(!levelNodes.length) return [];

  const counts=new Map();
  let mainClassId="";

  // Aurora level 1 contains the primary Class element.
  const levelOne=levelNodes.find(n=>n.getAttribute("name")==="1") || levelNodes[0];
  const mainClassChild=levelOne.querySelector(":scope > element[type='Class']");
  if(mainClassChild){
    mainClassId=mainClassChild.getAttribute("registered") || mainClassChild.getAttribute("id") || "";
  }

  for(const lvl of levelNodes){
    let classId=mainClassId;
    if(lvl.getAttribute("multiclass")==="true"){
      classId=normalizeMulticlassClassId(lvl.getAttribute("class") || "");
    }
    if(!classId) continue;
    counts.set(classId,(counts.get(classId)||0)+1);
  }

  return [...counts.entries()].map(([classId,levels])=>({
    classId,
    levels,
    hitDie: window.AURORA_CLASS_HD?.[classId] ? `d${window.AURORA_CLASS_HD[classId]}` : null
  }));
}

function calculateAuroraAbilitiesAndHp(doc, baseAbilities, level){
  const activeIds=[...doc.querySelectorAll("build > sum > element[id]")].map(x=>x.getAttribute("id"));
  const abilities={...baseAbilities};
  const abilityNames=["strength","dexterity","constitution","intelligence","wisdom","charisma"];

  // Apply simple numeric ability-score stat rules from active Aurora elements.
  for(const id of activeIds){
    const rule=window.AURORA_RULES?.[id];
    if(!rule?.stats) continue;
    for(const st of rule.stats){
      if(!abilityNames.includes(st.name)) continue;
      if(/^-?\d+$/.test(String(st.value))){
        abilities[st.name]=(Number(abilities[st.name]||0)+Number(st.value));
      }
    }
  }

  const classLevels=deriveAuroraClassLevels(doc);
  const conMod=Math.floor((Number(abilities.constitution||10)-10)/2);
  let hp=0;
  let hpCalculated=false;

  // Aurora saves per-level HP progression as rndhp values on Level elements.
  // Use those first, matching Aurora/Flare's own approach. This preserves rolled
  // or average HP and works naturally with multiclass characters.
  const levelNodes=[...doc.querySelectorAll("build > elements > element[type='Level']")];
  if(levelNodes.length){
    let allHadHp=true;
    for(const lvl of levelNodes){
      const rnd=(lvl.getAttribute("rndhp")||"").split(",").filter(Boolean);
      let hpDieValue=null;

      // Aurora may store the sequence on each level element or only on one element.
      // If a concrete value for this character level is exposed, prefer it.
      if(rnd.length===1 && /^-?\d+$/.test(rnd[0])){
        hpDieValue=Number(rnd[0]);
      } else if(rnd.length>1){
        const charLevel=Math.max(1,Number(lvl.getAttribute("name")||1));
        const idx=Math.min(rnd.length-1,charLevel-1);
        if(/^-?\d+$/.test(rnd[idx])) hpDieValue=Number(rnd[idx]);
      }

      if(hpDieValue===null){
        // Fallback to class-average HP for this level if rndhp isn't directly usable.
        let classId="";
        if(lvl.getAttribute("multiclass")==="true"){
          classId=normalizeMulticlassClassId(lvl.getAttribute("class")||"");
        } else {
          classId=classLevels[0]?.classId || "";
        }
        const hd=Number(window.AURORA_CLASS_HD?.[classId]||0);
        if(hd){
          const isFirstLevel=(Number(lvl.getAttribute("name")||0)===1);
          hpDieValue=isFirstLevel ? hd : Math.floor(hd/2)+1;
        } else {
          allHadHp=false;
          continue;
        }
      }

      hp += Math.max(1,hpDieValue+conMod);
      hpCalculated=true;
    }
    if(!allHadHp && !hpCalculated) hp=0;
  }

  // If no per-level information was usable, reconstruct from class pools.
  if(!hpCalculated && classLevels.length){
    let firstLevel=true;
    for(const cls of classLevels){
      const hd=Number(window.AURORA_CLASS_HD?.[cls.classId]||0);
      if(!hd) continue;
      for(let i=0;i<cls.levels;i++){
        const dieHp=firstLevel ? hd : Math.floor(hd/2)+1;
        hp += Math.max(1,dieHp+conMod);
        firstLevel=false;
        hpCalculated=true;
      }
    }
  }

  // Apply active explicit HP bonuses such as Tough after class HP.
  if(hpCalculated){
    const ctx={level,abilities};
    for(const id of activeIds){
      const rule=window.AURORA_RULES?.[id];
      if(!rule?.stats) continue;
      for(const st of rule.stats){
        if(st.name==="hp"){
          hp += auroraIntValue(st.value,ctx);
        }
      }
    }
  }

  return {
    abilities,
    hp: hpCalculated ? hp : null,
    classLevels,
    activeIds
  };
}

function spellComponents(info){
  if(!info) return "";
  const parts=[];
  if(info.verbal) parts.push("V");
  if(info.somatic) parts.push("S");
  if(info.material) parts.push(info.materialComponent ? `M (${info.materialComponent})` : "M");
  return parts.join(", ");
}

let openSpellId=null;
function showAuroraSpell(spellId, fallbackName){
  const info=window.AURORA_SPELLS?.[spellId];
  if(!info){
    alert(`No Aurora description was found for ${fallbackName || "this spell"}.`);
    return;
  }
  openSpellId=spellId;
  q("#spellDialogName").textContent=info.name || fallbackName || "Spell";
  q("#spellDialogSource").textContent=info.source || "";

  const meta=[];
  meta.push(info.level===0 ? "Cantrip" : `Level ${info.level}`);
  if(info.school) meta.push(info.school);
  if(info.time) meta.push(`Casting: ${info.time}`);
  if(info.range) meta.push(`Range: ${info.range}`);
  if(info.duration) meta.push(`Duration: ${info.duration}`);
  const comps=spellComponents(info);
  if(comps) meta.push(`Components: ${comps}`);
  if(info.concentration) meta.push("Concentration");

  q("#spellDialogMeta").innerHTML=meta.map(x=>`<span class="mini-tag">${escapeHtml(x)}</span>`).join("");
  q("#spellDialogDescription").innerHTML=info.description || '<p class="muted">No description available.</p>';
  renderSpellUseControls(info,spellId);
  q("#spellDialog").showModal();
}

q("#spellDialogClose").onclick=()=>q("#spellDialog").close();


function auroraClassLevel(classLevels,name){
  const wanted=String(name||"").toLowerCase();
  let total=0;
  for(const c of classLevels||[]){
    const id=String(c.classId||"").toLowerCase();
    if(id.includes(`_${wanted}`) || id.endsWith(wanted)) total+=Number(c.levels)||0;
  }
  return total;
}

function evalAuroraResourceValue(expr,def,ctx,depth=0){
  if(depth>8) return 0;
  expr=String(expr||"").trim().toLowerCase();
  if(/^-?\d+$/.test(expr)) return Number(expr);

  if(expr==="proficiency"){
    return 2+Math.floor((Math.max(1,Number(ctx.level)||1)-1)/4);
  }

  const ability=expr.match(/^(strength|dexterity|constitution|intelligence|wisdom|charisma):modifier$/);
  if(ability){
    return Math.floor((Number(ctx.abilities?.[ability[1]])-10)/2);
  }

  const classLevel=expr.match(/^level:([a-z]+)$/);
  if(classLevel){
    return auroraClassLevel(ctx.classLevels,classLevel[1]);
  }

  const rules=(def.stats||[]).filter(s=>s.name===expr);
  if(!rules.length) return 0;

  const featureLevel=def.ownerClass
    ? auroraClassLevel(ctx.classLevels,def.ownerClass)
    : Number(ctx.level)||0;

  const applicable=rules.filter(r=>(Number(r.level)||0)<=featureLevel);
  if(!applicable.length) return 0;

  let total=0;
  const plain=applicable.filter(r=>!r.bonus);
  for(const r of plain){
    total+=evalAuroraResourceValue(r.value,def,ctx,depth+1);
  }

  const groups=new Map();
  for(const r of applicable.filter(r=>r.bonus)){
    if(!groups.has(r.bonus)) groups.set(r.bonus,[]);
    groups.get(r.bonus).push(r);
  }
  for(const group of groups.values()){
    const highest=Math.max(...group.map(r=>Number(r.level)||0));
    const atLevel=group.filter(r=>(Number(r.level)||0)===highest);
    // Aurora bonus groups such as "base" generally choose the strongest
    // applicable value; this also handles minimum-one ability-modifier pools.
    const values=atLevel.map(r=>evalAuroraResourceValue(r.value,def,ctx,depth+1));
    total+=Math.max(...values,0);
  }
  return total;
}


function auroraSpellLevel(spellId){
  return Number(window.AURORA_SPELLS?.[spellId]?.level ?? -1);
}

function activeAuroraElementNodes(doc){
  return [...doc.querySelectorAll("build > elements element")];
}

function nodeAuroraId(node){
  return node?.getAttribute("registered") || node?.getAttribute("id") || "";
}

function deriveAuroraFreeCastResources(doc,derived,level){
  const defs=window.AURORA_FREECAST_DEFS||{};
  const ctx={
    level:Number(level)||0,
    abilities:derived.abilities||{},
    classLevels:derived.classLevels||[]
  };

  const sumSpellIds=new Set(
    [...doc.querySelectorAll("build > sum > element[type='Spell'][id]")]
      .map(x=>x.getAttribute("id"))
      .filter(Boolean)
  );

  const output=[];
  const seenKeys=new Set();

  for(const node of activeAuroraElementNodes(doc)){
    const featureId=nodeAuroraId(node);
    const def=defs[featureId];
    if(!def) continue;

    let max=evalAuroraResourceValue(def.count,def,ctx);
    if(def.minimumOne) max=Math.max(1,max);
    max=Math.floor(Number(max)||0);
    if(max<=0) max=1;

    const candidates=new Map();

    const addSpell=(spellId,reason)=>{
      if(!spellId || !window.AURORA_SPELLS?.[spellId]) return;
      candidates.set(spellId,{id:spellId,reason});
    };

    // 1) Spell choices/grants actually saved beneath this active feature.
    const descendantSpells=[...node.querySelectorAll("element[type='Spell']")];
    for(const spell of descendantSpells){
      const sid=nodeAuroraId(spell);
      if(!sid) continue;

      const savedName=spell.getAttribute("name")||"";
      const level=auroraSpellLevel(sid);

      let matchesSelect=false;
      for(const sel of def.selects||[]){
        if(sel.name && savedName===sel.name){
          if(sel.level===null || sel.level===undefined || Number(sel.level)===level){
            matchesSelect=true;
            break;
          }
        }
      }

      // Nested-choice fallback: e.g. Magic Initiate's chosen level-1 spell lives
      // under the selected Cleric/Druid/Wizard child feature.
      const hinted=(def.levelHints||[]).includes(level);

      if(matchesSelect || hinted){
        addSpell(sid,"selected");
      }
    }

    // 2) Static grants from the Aurora feature, but only if they are actually active
    // on this character (prevents future-level grants appearing too early).
    for(const grant of def.grants||[]){
      if(grant.requiredLevel && Number(level)<Number(grant.requiredLevel)) continue;
      if(sumSpellIds.has(grant.id)) addSpell(grant.id,"grant");
    }

    // 3) Explicit spell names parsed from wording such as
    // "you can cast Misty Step without expending a spell slot".
    for(const sid of def.explicitSpellIds||[]){
      if(sumSpellIds.has(sid) || !(def.grants||[]).length){
        addSpell(sid,"text");
      }
    }

    let spellTargets=[...candidates.values()];

    // Level restrictions apply to the spell the feature asks the player to
    // choose, not to fixed spells granted by the same feature.
    //
    // Example: Fey-Touched grants Misty Step (level 2) and lets the player choose
    // a level-1 spell. Filtering every candidate to level 1 incorrectly removed
    // Misty Step.
    const hintedLevels=new Set((def.levelHints||[]).map(Number));
    if(hintedLevels.size){
      spellTargets=spellTargets.filter(s=>
        s.reason!=="selected" || hintedLevels.has(auroraSpellLevel(s.id))
      );
    }

    // Cantrips are normally already slot-free and at-will, so they are not the
    // once-per-rest free casting being tracked. This fixes Magic Initiate, where
    // the two chosen cantrips and the chosen level-1 spell are nested under the
    // same feature but only the level-1 spell gets a rest-limited free cast.
    spellTargets=spellTargets.filter(s=>{
      const spellLevel=auroraSpellLevel(s.id);
      if(spellLevel!==0) return true;

      // Keep a cantrip only when the feature's free-cast definition specifically
      // targets level 0 and has no higher-level selected-spell hint.
      const explicitCantripTarget=(def.levelHints||[]).includes(0) &&
        !(def.levelHints||[]).some(x=>Number(x)>0);
      return explicitCantripTarget;
    });

    const reset=def.reset==="short"?"short":"long";

    const pushResource=(key,name,spellId=null)=>{
      if(seenKeys.has(key)) return;
      seenKeys.add(key);
      output.push({
        autoKey:key,
        name,
        max,
        reset,
        shortRestore:reset==="short"?"full":null,
        source:def.source||"Aurora",
        featureId,
        spellId,
        resourceKind:spellId?"freecast-spell":"freecast-generic"
      });
    };

    if(spellTargets.length===1){
      const spell=spellTargets[0];
      const spellName=window.AURORA_SPELLS?.[spell.id]?.name || "Spell";
      const featureDisplayName=featureId.includes("MAGIC_INITIATE_")
        ? `Magic Initiate (${def.name})`
        : def.name;
      pushResource(
        `aurora:freecast:${featureId}:${spell.id}`,
        `${featureDisplayName}: ${spellName} (Free Cast)`,
        spell.id
      );
      continue;
    }

    if(spellTargets.length>1 && def.perSpell){
      for(const spell of spellTargets){
        const spellName=window.AURORA_SPELLS?.[spell.id]?.name || "Spell";
        const featureDisplayName=featureId.includes("MAGIC_INITIATE_")
          ? `Magic Initiate (${def.name})`
          : def.name;
        pushResource(
          `aurora:freecast:${featureId}:${spell.id}`,
          `${featureDisplayName}: ${spellName} (Free Cast)`,
          spell.id
        );
      }
      continue;
    }

    if(spellTargets.length>1){
      // Shared-use wording: don't pretend every spell has an independent use.
      pushResource(
        `aurora:freecast:${featureId}:shared`,
        `${def.name}: Free Spell Cast`
      );
      continue;
    }

    // Variable spell features such as "cast any Cleric spell of level 5 or lower"
    // get a generic tracker. Helper/ability-option elements that merely repeat a
    // parent's free-cast wording are ignored if they don't actually identify a spell.
    if(def.generic){
      pushResource(
        `aurora:freecast:${featureId}:generic`,
        `${def.name}: Free Spell Cast`
      );
    }
  }

  return output;
}

function deriveAuroraLimitedResources(doc,derived,level){
  const defs=window.AURORA_RESOURCE_DEFS||{};
  const ctx={
    level:Number(level)||0,
    abilities:derived.abilities||{},
    classLevels:derived.classLevels||[]
  };
  const out=[];

  const active=new Set(derived.activeIds||[]);
  for(const id of active){
    const def=defs[id];
    if(!def) continue;

    const featureLevel=def.ownerClass
      ? auroraClassLevel(ctx.classLevels,def.ownerClass)
      : ctx.level;

    const choices=(def.usage||[]).filter(x=>(Number(x.level)||0)<=featureLevel);
    if(!choices.length) continue;
    const highest=Math.max(...choices.map(x=>Number(x.level)||0));
    const opt=choices.find(x=>(Number(x.level)||0)===highest) || choices[0];

    let countExpr=String(opt.count||"");
    let max=0;
    const templ=countExpr.match(/^\{\{(.+)\}\}$/);
    if(templ) max=evalAuroraResourceValue(templ[1],def,ctx);
    else max=Number(countExpr)||0;

    max=Math.floor(max);
    if(max<=0 || max>999) continue;

    let shortRestore=null;
    if(opt.reset==="short"){
      shortRestore="full";
    }else{
      const recover=(def.shortRecover||[])
        .filter(x=>(Number(x.level)||0)<=featureLevel)
        .sort((a,b)=>(Number(b.level)||0)-(Number(a.level)||0))[0];
      if(recover) shortRestore=Number(recover.amount)||1;
    }

    out.push({
      autoKey:`aurora:${id}`,
      name:`${def.name}${opt.poolSuffix||""}`,
      max,
      reset:opt.reset,
      shortRestore,
      source:def.source||"Aurora",
      featureId:id,
      resourceKind:"aurora-feature"
    });
  }

  // Generic slot-free spell resources detected from active Aurora features.
  out.push(...deriveAuroraFreeCastResources(doc,{abilities:ctx.abilities,classLevels:ctx.classLevels,activeIds:[...active]},ctx.level));

  // De-duplicate aliases that resolve to the same feature/resource.
  const unique=new Map();
  for(const r of out){
    if(!unique.has(r.autoKey)) unique.set(r.autoKey,r);
  }
  return [...unique.values()];
}

function syncAuroraResources(target,defs){
  const old=Array.isArray(target.resources)?target.resources:[];
  const autoOld=new Map(old.filter(r=>r.autoKey).map(r=>[r.autoKey,r]));
  const manual=old.filter(r=>!r.autoKey);
  const consumedManual=new Set();

  const auto=(defs||[]).map(d=>{
    let prev=autoOld.get(d.autoKey);

    // If the user previously created the same resource manually, migrate its
    // spent-use state rather than showing a duplicate after Aurora import.
    if(!prev){
      const idx=manual.findIndex((r,i)=>
        !consumedManual.has(i) &&
        String(r.name||"").trim().toLowerCase()===String(d.name||"").trim().toLowerCase()
      );
      if(idx>=0){
        prev=manual[idx];
        consumedManual.add(idx);
      }
    }

    const oldMax=Math.max(1,Number(prev?.max)||d.max);
    const oldCurrent=clamp(Number(prev?.current ?? d.max),0,oldMax);
    const spent=Math.max(0,oldMax-oldCurrent);

    return {
      name:d.name,
      max:d.max,
      current:clamp(d.max-spent,0,d.max),
      reset:d.reset,
      shortRestore:d.shortRestore,
      autoKey:d.autoKey,
      source:d.source,
      featureId:d.featureId||null,
      spellId:d.spellId||null,
      resourceKind:d.resourceKind||null
    };
  });

  target.resources=[
    ...manual.filter((_,i)=>!consumedManual.has(i)),
    ...auto
  ];
}

function parseAuroraCharacter(xmlString, fileName){
  const parser=new DOMParser();
  const doc=parser.parseFromString(xmlString,"application/xml");
  if(doc.querySelector("parsererror") || doc.documentElement.tagName!=="character"){
    throw new Error("Not a valid Aurora .dnd5e character file.");
  }

  const display=doc.querySelector("display-properties");
  const build=doc.querySelector("build");
  const abilities=build?.querySelector("abilities");
  const spellcasting=build?.querySelector("magic > spellcasting");
  const slotsEl=spellcasting?.querySelector("slots");

  const className=xmlText(display,"class","Unknown Class");
  let subclass=xmlText(display,"archetype","");
  if(!subclass){
    const arch=doc.querySelector('build elements element[type="Archetype"][registered]');
    if(arch) subclass=titleFromAuroraId(arch.getAttribute("registered"));
  }

  const abilityNames=["strength","dexterity","constitution","intelligence","wisdom","charisma"];
  const abilityData={};
  abilityNames.forEach(a=>abilityData[a]=intText(abilities,a,0));

  const derived=calculateAuroraAbilitiesAndHp(doc,abilityData,intText(display,"level",0));

  const slots={};
  for(let i=1;i<=9;i++){
    slots[i]=Number(slotsEl?.getAttribute("s"+i) || 0);
  }

  const cantrips=[...(spellcasting?.querySelectorAll("cantrips > spell")||[])].map(s=>({
    name:s.getAttribute("name")||"",
    level:0,
    id:s.getAttribute("id")||"",
    prepared:true,
    alwaysPrepared:false,
    known:true
  }));

  const allSpells=[...(spellcasting?.querySelectorAll("spells > spell")||[])].map(s=>({
    name:s.getAttribute("name")||"",
    level:Number(s.getAttribute("level")||0),
    id:s.getAttribute("id")||"",
    prepared:s.getAttribute("prepared")==="true",
    alwaysPrepared:s.getAttribute("always-prepared")==="true",
    known:s.getAttribute("known")==="true"
  }));

  const preparedSpells=allSpells.filter(s=>s.prepared || s.alwaysPrepared || s.known);
  const switchable=allSpells.filter(s=>!s.alwaysPrepared && !s.known);
  const preparedLimit=switchable.filter(s=>s.prepared).length;
  const preparationMode=switchable.some(s=>!s.prepared) && preparedLimit>0;
  const importPrepared=Object.fromEntries(allSpells.map(s=>[s.id||s.name,!!s.prepared]));

  const equip=[...(build?.querySelectorAll(":scope > equipment > item")||[])].map(item=>{
    const adorners=[...item.querySelectorAll(":scope > items > adorner")].map(a=>({
      name:a.getAttribute("name")||"",
      id:a.getAttribute("id")||""
    }));
    const equipped=item.querySelector(":scope > equipped");
    return normalizeInventoryItem({
      identifier:item.getAttribute("identifier")||newUuid(),
      name:item.getAttribute("name")||"",
      id:item.getAttribute("id")||"",
      sidebar:item.getAttribute("sidebar")==="true",
      equipped:equipped?.textContent?.trim()==="true",
      location:equipped?.getAttribute("location")||"",
      adorners,
      notes:item.querySelector(":scope > details > notes")?.textContent||""
    });
  });


  const attacks=[...(build?.querySelectorAll(":scope > input > attacks > attack")||[])]
    .filter(x=>x.getAttribute("displayed")!=="false")
    .map(x=>({
      name:(x.getAttribute("name")||"Attack").trim(),
      range:x.getAttribute("range")||"",
      attack:x.getAttribute("attack")||"",
      damage:x.getAttribute("damage")||"",
      description:x.querySelector(":scope > description")?.textContent?.trim()||""
    }));

  const importedJournalNotes=parseAuroraJournalNotes(doc);

  const currency=build?.querySelector("input > currency");
  const coin={
    cp:intText(currency,"copper",0),
    sp:intText(currency,"silver",0),
    ep:intText(currency,"electrum",0),
    gp:intText(currency,"gold",0),
    pp:intText(currency,"platinum",0)
  };

  return {
    sourceFile:fileName || "Aurora character",
    sourceUri:(window.AuroraBridge?.getLastSelectedUri?.()||""),
    importedAt:new Date().toISOString(),
    name:xmlText(display,"name","Imported Character"),
    race:xmlText(display,"race",""),
    className,
    subclass,
    background:xmlText(display,"background",""),
    level:intText(display,"level",0),
    abilities:derived.abilities,
    maxHp:derived.hp,
    classLevels:derived.classLevels,
    activeIds:derived.activeIds,
    autoResources:deriveAuroraLimitedResources(doc,derived,intText(display,"level",0)),
    spellcasting: spellcasting ? {
      name:spellcasting.getAttribute("name")||className,
      ability:spellcasting.getAttribute("ability")||"",
      attack:Number(spellcasting.getAttribute("attack")||0),
      dc:Number(spellcasting.getAttribute("dc")||0),
      slots
    } : null,
    cantrips,
    spells:preparedSpells,
    allSpells,
    importPrepared,
    preparedLimit,
    preparationMode,
    equipment:equip,
    importEquipment:deepClone(equip),
    attacks,
    currency:coin,
    importJournalNotes:deepClone(importedJournalNotes),
    journalNotes:deepClone(importedJournalNotes)
  };
}

function applyAuroraImport(data){
  // Match an already-imported copy by source file first, then by character name.
  let target=state.characters.find(c=>c.aurora?.sourceFile===data.sourceFile);
  if(!target) target=state.characters.find(c=>c.aurora?.name===data.name);

  const isNew=!target;
  const previousAurora=target?.aurora || null;
  const localPreparedChanges={};
  if(previousAurora?.allSpells?.length){
    for(const s of previousAurora.allSpells){
      const key=s.id||s.name;
      const baseline=!!previousAurora.importPrepared?.[key];
      if(!s.alwaysPrepared && !s.known && !!s.prepared!==baseline){
        localPreparedChanges[key]=!!s.prepared;
      }
    }
  }
  const preserveLocalInventory=!!previousAurora && !equipmentEquals(previousAurora.equipment,previousAurora.importEquipment);
  const localInventory=preserveLocalInventory ? deepClone(previousAurora.equipment) : null;
  const preserveLocalJournal=!!previousAurora && !journalNotesEqual(target?.journalNotes||[],previousAurora.importJournalNotes||[]);
  const localJournal=preserveLocalJournal ? deepClone(target.journalNotes||[]) : null;
  // Attunement and remaining charges are tracker-only session metadata. Preserve
  // them across Aurora refreshes by matching the stable equipment instance UUID.
  if(previousAurora?.equipment?.length && data.equipment?.length){
    const previousById=new Map(previousAurora.equipment.map(it=>[it.identifier,it]));
    for(const it of data.equipment){
      const prev=previousById.get(it.identifier);
      if(!prev) continue;
      it.attuned=!!prev.attuned;
      if(prev.chargesCurrent!==null && prev.chargesCurrent!==undefined) it.chargesCurrent=prev.chargesCurrent;
    }
  }
  if(isNew){
    const placeholder=state.characters.find(c=>isUntouchedDefaultPlaceholderCharacter(c,state));
    if(placeholder){
      // The first real Aurora character takes over the untouched starter slot.
      target=placeholder;
      target.name=data.name||target.name;
    }else{
      target=defaultCharacter(data.name);
      state.characters.push(target);
    }
  }
  if(!data.sourceUri && previousAurora?.sourceUri) data.sourceUri=previousAurora.sourceUri;

  // Aurora refresh updates the baseline while preserving explicit preparation
  // changes made in the app. Reset to Aurora discards that local overlay.
  if(!isNew && data.allSpells?.length){
    for(const s of data.allSpells){
      const key=s.id||s.name;
      if(Object.prototype.hasOwnProperty.call(localPreparedChanges,key) && !s.alwaysPrepared && !s.known){
        s.prepared=localPreparedChanges[key];
      }
    }
    data.spells=data.allSpells.filter(s=>s.prepared||s.alwaysPrepared||s.known);
  }

  // Aurora owns build information. Tracker owns temporary/session state.
  // If inventory has unsaved local edits, keep those edits while treating this refresh
  // as the new Reset-to-Aurora baseline.
  if(localInventory) data.equipment=localInventory;
  target.journalNotes=localJournal || deepClone(data.journalNotes||[]);
  delete data.journalNotes;
  target.name=data.name || target.name;
  target.aurora=data;

  // User-requested behavior: Aurora import/refresh resets tracker HP to the
  // imported computed maximum.
  if(Number.isFinite(Number(data.maxHp)) && Number(data.maxHp)>0){
    target.hp.max=Number(data.maxHp);
    target.hp.current=Number(data.maxHp);
    target.hp.temp=0;
  }

  // Populate one Hit Dice pool per Aurora class. On refresh, preserve
  // spent dice independently for each die type.
  if(Array.isArray(data.classLevels) && data.classLevels.length){
    const oldPools=target.hitDice || [];
    const grouped=new Map();

    for(const cls of data.classLevels){
      if(!cls.hitDie || !Number(cls.levels)) continue;
      // Multiple classes can share the same hit die (e.g. Cleric + Rogue both d8);
      // combine them because the tracker spends hit dice by die size.
      const entry=grouped.get(cls.hitDie) || {die:cls.hitDie,max:0,used:0};
      entry.max += Number(cls.levels);
      grouped.set(cls.hitDie,entry);
    }

    target.hitDice=[...grouped.values()].map(pool=>{
      const prev=oldPools.find(h=>h.die===pool.die);
      pool.used=clamp(Number(prev?.used)||0,0,pool.max);
      return pool;
    });
  }

  syncAuroraResources(target,data.autoResources||[]);

  if(data.spellcasting?.slots){
    for(let lvl=1;lvl<=9;lvl++){
      const slot=target.spellSlots[lvl] || {used:0,max:0};
      slot.max=Number(data.spellcasting.slots[lvl]||0);
      slot.used=clamp(slot.used,0,slot.max);
      target.spellSlots[lvl]=slot;
    }
  }

  // Currency is session-editable. First import loads Aurora. On refresh, only
  // replace local money when it still matched the previous Aurora baseline.
  if(data.currency){
    if(isNew || !previousAurora || currencyEquals(target.currency,previousAurora.currency)){
      target.currency={...data.currency};
    }
  }

  currentId=target.id;
  renderAll();
  alert(isNew ? `Imported ${data.name}.` : `Refreshed ${data.name} from Aurora.`);
}

function renderAuroraProfile(){
  const c=current();
  const card=q("#auroraProfileCard");
  if(!c?.aurora){
    card?.classList.add("hidden");
    const save=q("#saveAuroraBtn"); if(save) save.disabled=true;
    return;
  }
  const a=c.aurora;
  card.classList.remove("hidden");

  const when=a.importedAt ? new Date(a.importedAt).toLocaleString() : "";
  q("#auroraImportMeta").textContent=`${a.sourceFile || "Aurora"}${when ? " • "+when : ""}`;

  const tiles=[
    ["Name",a.name||c.name],
    ["Species",a.race||"—"],
    ["Class",Array.isArray(a.classLevels) && a.classLevels.length>1
      ? `${a.className||"Multiclass"}`
      : `${a.className||"—"}${a.subclass ? " — "+a.subclass : ""}`],
    ["Level",String(a.level||"—")],
    ["Max HP",a.maxHp ? String(a.maxHp) : "—"],
    ["Hit Dice",Array.isArray(a.classLevels) && a.classLevels.length
      ? a.classLevels.filter(x=>x.hitDie).map(x=>`${x.levels}${x.hitDie}`).join(" + ")
      : "—"],
    ["Background",a.background||"—"],
    ["Armor Class",armorClassInfo(c).available?String(armorClassInfo(c).total):"—"],
    ["Spell Ability",a.spellcasting?.ability||"—"],
    ["Spell Attack",a.spellcasting ? `${a.spellcasting.attack>=0?"+":""}${a.spellcasting.attack}` : "—"],
    ["Spell Save DC",a.spellcasting?.dc ? String(a.spellcasting.dc) : "—"]
  ];
  q("#auroraSummary").innerHTML=tiles.map(([l,v])=>
    `<div class="info-tile"><div class="label">${escapeHtml(l)}</div><div class="value">${escapeHtml(v)}</div></div>`
  ).join("");

  const abbr={strength:"STR",dexterity:"DEX",constitution:"CON",intelligence:"INT",wisdom:"WIS",charisma:"CHA"};
  q("#auroraAbilities").innerHTML=Object.entries(a.abilities||{}).map(([k,v])=>{
    const mod=Math.floor((Number(v)-10)/2);
    return `<div class="ability"><span class="muted small">${abbr[k]||k}</span><strong>${v}</strong><span class="small">${mod>=0?"+":""}${mod}</span></div>`;
  }).join("");

  if(a.spellcasting){
    const available=Object.entries(a.spellcasting.slots||{}).filter(([,n])=>Number(n)>0)
      .map(([lvl,n])=>`L${lvl}: ${n}`).join(" • ");
    q("#auroraSpellcasting").innerHTML=
      `<div class="muted small">${escapeHtml(a.spellcasting.name||"Spellcasting")} • ${escapeHtml(a.spellcasting.ability||"")} • Attack ${a.spellcasting.attack>=0?"+":""}${a.spellcasting.attack} • DC ${a.spellcasting.dc}</div>`+
      `<div class="top-space"><strong>Slot maxima:</strong> ${escapeHtml(available||"None")}</div>`;
  } else {
    q("#auroraSpellcasting").innerHTML='<div class="muted small">No spellcasting block found in this save.</div>';
  }

  const flexible=(a.allSpells||[]).filter(s=>!s.alwaysPrepared&&!s.known);
  const flexPrepared=flexible.filter(s=>s.prepared).length;
  const alwaysPrepared=(a.allSpells||[]).filter(s=>s.alwaysPrepared||s.known).length;
  const prepMeta=q("#preparedSpellMeta");
  const resetPrep=q("#resetPreparedBtn");
  if(a.preparationMode){
    prepMeta.textContent=`Flexible prepared: ${flexPrepared} / ${a.preparedLimit} • ${alwaysPrepared} always prepared/known`;
    const prepDirty=(a.allSpells||[]).some(s=>{
      const key=s.id||s.name;
      return !s.alwaysPrepared&&!s.known && !!s.prepared!==!!a.importPrepared?.[key];
    });
    if(prepDirty) prepMeta.textContent += " • Changed in app";
    prepMeta.classList.toggle("sync-dirty",prepDirty);
    resetPrep.disabled=!prepDirty;
  }else{
    prepMeta.textContent="Aurora does not expose switchable prepared spells for this spellcasting list.";
    prepMeta.classList.remove("sync-dirty");
    resetPrep.disabled=true;
  }

  const allDisplaySpells=[...(a.cantrips||[]),...(a.allSpells||a.spells||[])];
  const isSpellPrepared=s=>s.level===0||!!s.prepared||!!s.alwaysPrepared||!!s.known;
  const alpha=(x,y)=>String(x.name||"").localeCompare(String(y.name||""),undefined,{sensitivity:"base"});
  const preparedDisplay=allDisplaySpells.filter(isSpellPrepared).sort(alpha);
  const unpreparedDisplay=allDisplaySpells.filter(s=>!isSpellPrepared(s)).sort(alpha);

  const spellRowHtml=s=>{
    const isCantrip=s.level===0;
    const locked=isCantrip||s.alwaysPrepared||s.known||!a.preparationMode;
    const tags=[isCantrip?"Cantrip":`Level ${s.level}`];
    if(s.alwaysPrepared) tags.push("Always Prepared");
    else if(s.known) tags.push("Known");
    else if(s.prepared) tags.push("Prepared");
    else if(!isCantrip) tags.push("Available");
    const canOpen=!!window.AURORA_SPELLS?.[s.id];
    const toggleLabel=locked
      ? (s.alwaysPrepared?"Always":s.known||isCantrip?"Known":"Fixed")
      : (s.prepared?"Prepared":"Prepare");
    return `<div class="spell-row preparation-row ${canOpen?"clickable":""}" data-spell-id="${escapeHtml(s.id||"")}" data-spell-name="${escapeHtml(s.name)}">
      <div class="spell-main"><strong>${escapeHtml(s.name)}</strong><div class="spell-tags">${tags.map(t=>`<span class="mini-tag">${escapeHtml(t)}</span>`).join("")}</div></div>
      <button type="button" class="secondary prepare-toggle ${s.prepared?"prepared":""} ${locked?"locked":""}" data-prepare-id="${escapeHtml(s.id||s.name)}" ${locked?"disabled":""}>${escapeHtml(toggleLabel)}</button>
    </div>`;
  };

  const spellSections=[];
  if(preparedDisplay.length){
    spellSections.push(`<div class="spell-section-heading">
      <span>Prepared / Always Available</span>
      <span class="muted small">${preparedDisplay.length}</span>
    </div>${preparedDisplay.map(spellRowHtml).join("")}`);
  }
  if(unpreparedDisplay.length){
    spellSections.push(`<div class="spell-section-heading unprepared-heading">
      <span>Unprepared</span>
      <span class="muted small">${unpreparedDisplay.length}</span>
    </div>${unpreparedDisplay.map(spellRowHtml).join("")}`);
  }

  q("#auroraSpells").innerHTML=spellSections.length
    ? spellSections.join("")
    : '<div class="muted small">No spells found.</div>';

  q("#auroraSpells").querySelectorAll(".spell-row.clickable").forEach(row=>{
    row.querySelector(".spell-main")?.addEventListener("click",()=>showAuroraSpell(row.dataset.spellId,row.dataset.spellName));
  });
  q("#auroraSpells").querySelectorAll(".prepare-toggle:not(.locked)").forEach(btn=>{
    btn.onclick=e=>{
      e.stopPropagation();
      const spell=(a.allSpells||[]).find(s=>(s.id||s.name)===btn.dataset.prepareId);
      if(!spell) return;
      if(!spell.prepared){
        const count=(a.allSpells||[]).filter(s=>!s.alwaysPrepared&&!s.known&&s.prepared).length;
        if(count>=Number(a.preparedLimit||0)){
          alert(`You already have ${a.preparedLimit} flexible spells prepared. Unprepare one first.`);
          return;
        }
      }
      spell.prepared=!spell.prepared;
      a.spells=(a.allSpells||[]).filter(s=>s.prepared||s.alwaysPrepared||s.known);
      renderAuroraProfile(); saveState();
    };
  });

  updateSaveAuroraButton();
}



let managedJournalNoteId=null;
function currentJournalNotes(){
  const c=current();
  if(!Array.isArray(c.journalNotes)) c.journalNotes=[];
  return c.journalNotes;
}
function journalNoteTypeLabel(type){ return JOURNAL_NOTE_TYPES[type]||"General"; }
function journalNoteMatchesFilter(note,filter){
  if(filter==="all") return true;
  if(filter==="impersonate") return note.type==="identity"&&!!note.canImpersonate;
  return note.type===filter;
}
function journalNoteSearchText(note){
  return [note.title,note.type,...(note.tags||[]),note.appearance,note.voice,note.body].join(" ").toLowerCase();
}
function journalNotePreview(value="",max=220){
  const s=String(value||"").replace(/\s+/g," ").trim();
  return s.length>max?s.slice(0,max-1)+"…":s;
}
function formatJournalNoteDate(value){
  const d=new Date(value||"");
  if(Number.isNaN(d.getTime())) return "";
  try{
    return d.toLocaleString([], {day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
  }catch{
    return d.toISOString().replace("T"," ").slice(0,16);
  }
}
function journalNoteCardHtml(note){
  const tags=(note.tags||[]).map(t=>`<span class="mini-tag">${escapeHtml(t)}</span>`).join("");
  const identity=note.type==="identity";
  const body=journalNotePreview(note.body);
  const appearance=identity?journalNotePreview(note.appearance,150):"";
  const voice=identity?journalNotePreview(note.voice,150):"";
  return `<article class="journal-note-card ${note.pinned?"pinned":""}" data-note-id="${escapeHtml(note.id)}">
    <div class="journal-note-head">
      <div class="grow">
        <div class="row gap wrap journal-note-title-row">
          ${note.pinned?'<span class="note-pin" title="Pinned">★</span>':""}
          <h3>${escapeHtml(note.title)}</h3>
        </div>
        <div class="journal-note-tags"><span class="mini-tag note-type-tag">${escapeHtml(journalNoteTypeLabel(note.type))}</span>${identity&&note.canImpersonate?'<span class="mini-tag impersonate-tag">Can Impersonate</span>':""}${tags}</div>
      </div>
      <div class="row gap journal-note-actions">
        <button type="button" class="secondary small-btn note-pin-btn">${note.pinned?"Unpin":"Pin"}</button>
        <button type="button" class="secondary small-btn note-edit-btn">Edit</button>
        <button type="button" class="danger ghost small-btn note-delete-btn">Delete</button>
      </div>
    </div>
    ${appearance?`<div class="journal-note-field"><strong>Appearance</strong><p>${escapeHtml(appearance)}</p></div>`:""}
    ${voice?`<div class="journal-note-field"><strong>Voice / Mannerisms</strong><p>${escapeHtml(voice)}</p></div>`:""}
    ${body?`<div class="journal-note-field"><strong>Notes</strong><p>${escapeHtml(body)}</p></div>`:'<div class="muted small journal-note-empty">No additional notes.</div>'}
    <div class="muted small journal-note-updated">Updated ${escapeHtml(formatJournalNoteDate(note.updatedAt)||"recently")}</div>
  </article>`;
}
function renderJournalNotes(){
  const c=current();
  const all=currentJournalNotes().map(normalizeJournalNote);
  c.journalNotes=all;
  const search=(q("#journalNoteSearch")?.value||"").trim().toLowerCase();
  const filter=q("#journalNoteFilter")?.value||"all";
  const sorted=[...all].sort((a,b)=>Number(b.pinned)-Number(a.pinned)||(b.updatedAt||"").localeCompare(a.updatedAt||"")||a.title.localeCompare(b.title));
  const visible=sorted.filter(n=>journalNoteMatchesFilter(n,filter)&&(!search||journalNoteSearchText(n).includes(search)));

  q("#notesCharacterMeta").textContent=c.aurora
    ? `${c.name} • Notes can be embedded in ${c.aurora.sourceFile||"the Aurora character file"}`
    : `${c.name} • Stored locally until this character is linked to an Aurora file`;
  q("#journalNoteCount").textContent=`${all.length} note${all.length===1?"":"s"}`;
  const identities=all.filter(n=>n.type==="identity");
  q("#identityNoteCount").textContent=`${identities.length} identit${identities.length===1?"y":"ies"}`;
  const impersonations=identities.filter(n=>n.canImpersonate).length;
  q("#impersonationNoteCount").textContent=`${impersonations} impersonation${impersonations===1?"":"s"}`;

  const box=q("#journalNotesList");
  box.innerHTML=visible.length?visible.map(journalNoteCardHtml).join(""):'<div class="empty-state muted">No notes match this view.</div>';
  box.querySelectorAll(".journal-note-card").forEach(card=>{
    const id=card.dataset.noteId;
    card.querySelector(".note-edit-btn").onclick=()=>openJournalNoteDialog(id);
    card.querySelector(".note-pin-btn").onclick=()=>{
      const n=currentJournalNotes().find(x=>x.id===id); if(!n) return;
      n.pinned=!n.pinned; n.updatedAt=new Date().toISOString(); renderJournalNotes(); updateSaveAuroraButton(); saveState();
    };
    card.querySelector(".note-delete-btn").onclick=()=>{
      const n=currentJournalNotes().find(x=>x.id===id); if(!n) return;
      if(!confirm(`Delete note "${n.title}"?`)) return;
      c.journalNotes=currentJournalNotes().filter(x=>x.id!==id); renderJournalNotes(); updateSaveAuroraButton(); saveState();
    };
  });

  const baseline=c.aurora?.importJournalNotes||[];
  const dirty=!!c.aurora&&!journalNotesEqual(c.journalNotes,baseline);
  q("#notesSyncStatus").textContent=c.aurora
    ? (dirty?"Notes changed in app • Save to Aurora to write back":"Notes match Aurora")
    : "Local notes only";
  q("#resetJournalNotesBtn").disabled=!c.aurora;
  q("#notesSaveAuroraBtn").disabled=!c.aurora?.sourceUri || !window.AuroraBridge?.writeDocument;
}
function updateIdentityNoteFields(){
  const identity=q("#journalNoteType").value==="identity";
  q("#identityNoteFields").classList.toggle("hidden",!identity);
}
function openJournalNoteDialog(id=null){
  managedJournalNoteId=id;
  const note=id?currentJournalNotes().find(x=>x.id===id):null;
  const n=note?normalizeJournalNote(note):normalizeJournalNote({id:newUuid(),type:"general",title:"",updatedAt:new Date().toISOString()});
  q("#journalNoteDialogTitle").textContent=note?"Edit Note":"Add Note";
  q("#journalNoteType").value=n.type;
  q("#journalNoteTitle").value=note?n.title:"";
  q("#journalNoteTags").value=(n.tags||[]).join(", ");
  q("#journalNotePinned").checked=!!n.pinned;
  q("#journalNoteCanImpersonate").checked=!!n.canImpersonate;
  q("#journalNoteAppearance").value=n.appearance||"";
  q("#journalNoteVoice").value=n.voice||"";
  q("#journalNoteBody").value=n.body||"";
  updateIdentityNoteFields();
  q("#journalNoteDialog").showModal();
  setTimeout(()=>q("#journalNoteTitle").focus(),50);
}
function saveJournalNoteFromDialog(){
  const title=q("#journalNoteTitle").value.trim();
  if(!title){ alert("Give the note a name or title first."); q("#journalNoteTitle").focus(); return; }
  const type=q("#journalNoteType").value;
  const existing=managedJournalNoteId?currentJournalNotes().find(x=>x.id===managedJournalNoteId):null;
  const note=normalizeJournalNote({
    id:existing?.id||newUuid(),type,title,
    tags:q("#journalNoteTags").value,
    pinned:q("#journalNotePinned").checked,
    canImpersonate:type==="identity"&&q("#journalNoteCanImpersonate").checked,
    appearance:type==="identity"?q("#journalNoteAppearance").value:"",
    voice:type==="identity"?q("#journalNoteVoice").value:"",
    body:q("#journalNoteBody").value,
    updatedAt:new Date().toISOString()
  });
  const notes=currentJournalNotes();
  if(existing){
    const idx=notes.findIndex(x=>x.id===existing.id); notes[idx]=note;
  }else notes.push(note);
  q("#journalNoteDialog").close();
  managedJournalNoteId=null;
  renderJournalNotes(); updateSaveAuroraButton(); saveState();
}
q("#addJournalNoteBtn").onclick=()=>openJournalNoteDialog();
q("#closeJournalNoteDialogBtn").onclick=()=>q("#journalNoteDialog").close();
q("#saveJournalNoteBtn").onclick=saveJournalNoteFromDialog;
q("#journalNoteType").onchange=updateIdentityNoteFields;
q("#journalNoteSearch").oninput=renderJournalNotes;
q("#journalNoteFilter").onchange=renderJournalNotes;
q("#resetJournalNotesBtn").onclick=()=>{
  const c=current(); if(!c.aurora) return;
  if(!journalNotesEqual(c.journalNotes,c.aurora.importJournalNotes||[]) && !confirm("Discard note changes made in the app and restore the notes from the last Aurora import/save?")) return;
  c.journalNotes=deepClone(c.aurora.importJournalNotes||[]);
  renderJournalNotes(); updateSaveAuroraButton(); saveState();
};
q("#notesSaveAuroraBtn").onclick=()=>q("#saveAuroraBtn").click();


let managedInventoryIdentifier=null;

function inventoryCategory(item){
  const def=itemDisplayDef(item) || itemDef(item.id);
  if(item.equipped) return "Equipped";
  if((item.adorners||[]).length || def?.elementType==="Magic Item") return "Magic Items";
  if(def?.elementType==="Weapon") return "Weapons";
  if(def?.elementType==="Armor") return "Armor";
  return def?.category || "Gear";
}
function itemWeightLb(item){
  const base=itemDef(item.id);
  const n=Number(base?.weightLb);
  return Number.isFinite(n)?n:0;
}
function inventoryGroupRows(items){
  const map=new Map();
  for(const it of items){
    const key=inventoryKey(it);
    if(!map.has(key)) map.set(key,{key,item:it,instances:[]});
    map.get(key).instances.push(it);
  }
  return [...map.values()];
}
function inventoryTitle(item){
  const mods=(item.adorners||[]).map(a=>a.name).filter(Boolean);
  return mods.length ? mods[mods.length-1] : item.name;
}
function inventorySubtitle(item,qty){
  const def=itemDisplayDef(item)||itemDef(item.id);
  const bits=[];
  if(item.equipped) bits.push(`Equipped${item.location?" — "+item.location:""}`);
  else bits.push("Carried");
  if(qty>1) bits.push(`Qty ${qty}`);
  if(def?.rarity) bits.push(def.rarity);
  if(def?.weight) bits.push(def.weight);
  if(def?.attunement) bits.push(item.attuned?"Attuned":"Requires Attunement");
  return bits.join(" • ");
}

function companionFormIds(preset){
  if(preset==="primal") return [PRIMAL_LAND_ID,PRIMAL_SEA_ID,PRIMAL_SKY_ID].filter(id=>window.AURORA_COMPANIONS?.[id]);
  const ids=preset==="chain" ? (window.AURORA_CHAIN_FAMILIAR_IDS||[]) : (window.AURORA_FAMILIAR_IDS||[]);
  return [...ids].filter(id=>window.AURORA_COMPANIONS?.[id]).sort((a,b)=>window.AURORA_COMPANIONS[a].name.localeCompare(window.AURORA_COMPANIONS[b].name));
}
function isSpecialPactForm(preset,def){
  return preset==="chain" && def?.category==="variant";
}
function setCompanionSpiritOptions(preset,def){
  const select=q("#companionSpiritType"), label=q("#companionSpiritLabel"), hint=q("#companionSpiritHint");
  if(!select) return;
  const special=isSpecialPactForm(preset,def);
  if(special){
    const actual=def?.type||"Companion";
    select.innerHTML=`<option value="${escapeHtml(actual)}">${escapeHtml(actual)}</option>`;
    select.value=actual;
    select.disabled=true;
    label.textContent="Creature type";
    hint.textContent=`Set automatically from the ${def?.name||"selected"} stat block.`;
  }else{
    const previous=["Celestial","Fey","Fiend"].includes(select.value)?select.value:"Celestial";
    select.innerHTML='<option>Celestial</option><option>Fey</option><option>Fiend</option>';
    select.value=previous;
    select.disabled=false;
    label.textContent="Spirit type";
    hint.textContent="Find Familiar lets you choose Celestial, Fey, or Fiend for a normal familiar form.";
  }
}
function openAddCompanion(preset="familiar"){
  if(PUBLIC_EDITION && preset!=="custom") preset="custom";
  q("#companionPresetType").value=preset;
  q("#companionName").value="";
  q("#companionCreateNotes").value="";
  q("#companionSpiritType").value="Celestial";
  q("#companionSummonLevel").value="2";
  q("#companionDamageType").value="Fire";
  updateCompanionCreateForm();
  q("#addCompanionDialog").showModal();
}
function updateCompanionCreateForm(){
  const preset=q("#companionPresetType").value;
  const needsForm=preset==="familiar"||preset==="chain"||preset==="primal";

  q("#companionFormRow").classList.toggle("hidden",!needsForm);
  q("#companionSpiritRow").classList.toggle("hidden",!(preset==="familiar"||preset==="chain"));
  q("#companionSummonLevelRow").classList.toggle("hidden",preset!=="homunculus");
  q("#companionDamageTypeRow").classList.toggle("hidden",preset!=="drake");
  q("#customCompanionFields").classList.toggle("hidden",preset!=="custom");

  if(needsForm){
    const existing=q("#companionForm").value;
    const ids=companionFormIds(preset);
    q("#companionForm").innerHTML=ids.map(id=>{
      const d=window.AURORA_COMPANIONS[id];
      const extra=d.category==="variant"?" • special Pact form":"";
      return `<option value="${escapeHtml(id)}">${escapeHtml(d.name+extra)}</option>`;
    }).join("");
    if(ids.includes(existing)) q("#companionForm").value=existing;

    if(preset==="familiar"||preset==="chain"){
      const def=window.AURORA_COMPANIONS?.[q("#companionForm").value];
      setCompanionSpiritOptions(preset,def);
    }
  }

  updateCompanionCreatePreview();
}
function companionDraftFromCreateForm(){
  const preset=q("#companionPresetType").value;
  const usesForm=preset==="familiar"||preset==="chain"||preset==="primal";
  const formId=usesForm?q("#companionForm").value:"";
  const def=
    preset==="homunculus"?window.AURORA_COMPANIONS?.[HOMUNCULUS_COMPANION_ID]:
    preset==="steel"?window.AURORA_COMPANIONS?.[STEEL_DEFENDER_COMPANION_ID]:
    preset==="wildfire"?window.AURORA_COMPANIONS?.[WILDFIRE_SPIRIT_COMPANION_ID]:
    preset==="drake"?window.AURORA_COMPANIONS?.[DRAKE_SMALL_ID]:
    window.AURORA_COMPANIONS?.[formId];

  const summonLevel=Math.max(2,Math.min(9,Number(q("#companionSummonLevel").value)||2));

  let customMax=10,customAc=10,customSpeed="30 ft.",customType="Companion";
  if(preset==="custom"){
    customMax=Math.max(1,Number(q("#customCompanionHp").value)||10);
    customAc=Math.max(0,Number(q("#customCompanionAc").value)||10);
    customSpeed=q("#customCompanionSpeed").value.trim()||"30 ft.";
    customType=q("#customCompanionType").value.trim()||"Companion";
  }

  const fallback=
    preset==="homunculus"?"Homunculus Servant":
    preset==="steel"?"Steel Defender":
    preset==="drake"?"Drake Companion":
    preset==="wildfire"?"Wildfire Spirit":
    (def?.name||"Companion");

  const comp=normalizeCompanion({
    id:"__preview__",
    ownerCharacterId:currentId,
    presetType:preset,
    formId,
    name:q("#companionName").value.trim()||fallback,
    spiritType:(preset==="familiar"||preset==="chain")?q("#companionSpiritType").value:"",
    damageType:preset==="drake"?q("#companionDamageType").value:"Fire",
    summonLevel,
    hp:{current:customMax,max:customMax,temp:0},
    customAc,
    customSpeed,
    customType,
    notes:q("#companionCreateNotes").value
  });

  const calc=companionComputed(comp);
  comp.hp.max=calc.maxHp;
  comp.hp.current=calc.maxHp;
  return comp;
}
function updateCompanionCreatePreview(){
  const comp=companionDraftFromCreateForm();
  const calc=companionComputed(comp), def=calc.def;
  q("#companionCreatePreviewName").textContent=comp.name||"Stat block preview";
  q("#companionCreatePreviewSource").textContent=def?.source||"Custom companion";
  const tags=[calc.type,`AC ${calc.ac}`,`HP ${calc.maxHp}`,calc.speed].filter(Boolean);
  q("#companionCreatePreviewMeta").innerHTML=tags.map(x=>`<span class="mini-tag">${escapeHtml(x)}</span>`).join("");
  q("#companionCreatePreviewScaling").innerHTML=companionScalingHtml(comp,calc);
  q("#companionCreatePreviewScaling").classList.toggle("hidden",!q("#companionCreatePreviewScaling").innerHTML.trim());
  q("#companionCreatePreviewBlock").innerHTML=companionStatBlockHtml(comp,calc,{includeDescription:true,includeNotes:false});
}
function createCompanionFromDialog(){
  const draft=companionDraftFromCreateForm();
  const comp=normalizeCompanion({...draft,id:newUuid(),createdAt:new Date().toISOString()});
  const calc=companionComputed(comp);
  comp.hp.max=calc.maxHp;
  comp.hp.current=calc.maxHp;
  comp.hp.temp=0;
  state.companions.push(comp);
  q("#addCompanionDialog").close();
  renderCompanions();
  renderEncounter();
  saveState();
}
function companionSubtitle(comp){
  const calc=companionComputed(comp);
  if(comp.presetType==="homunculus") return `Homunculus Servant • spell level ${comp.summonLevel}`;
  if(comp.presetType==="steel") return "Battle Smith • Steel Defender";
  if(comp.presetType==="primal") return `Beast Master • ${calc.def?.name||"Primal Companion"}`;
  if(comp.presetType==="drake") return `Drakewarden • ${calc.def?.size||""} Drake Companion`.replace(/\s+/g," ").trim();
  if(comp.presetType==="wildfire") return "Circle of Wildfire • Wildfire Spirit";
  if(comp.presetType==="chain") return `Pact of the Chain • ${calc.def?.name||"Familiar"}`;
  if(comp.presetType==="familiar") return `Find Familiar • ${calc.def?.name||"Familiar"}`;
  return calc.type||"Custom Companion";
}
function renderCompanions(){
  if(!q("#companionList")) return;
  const owner=current();
  q("#companionOwnerMeta").textContent=owner?.aurora?`${owner.name} • Aurora-linked presets available automatically`:`${owner?.name||"Character"} • local companion tracking`;
  const list=currentCompanions();
  for(const comp of list) syncCompanionDerivedHp(comp);
  q("#companionCount").textContent=String(list.length);

  const suggestions=[];
  const activeIds=owner?.aurora?.activeIds||[];
  if(auroraHasSpell(owner,HOMUNCULUS_SPELL_ID)) suggestions.push({preset:"homunculus",title:"Homunculus Servant",sub:"Detected in Aurora spells"});
  if(activeIds.includes(STEEL_DEFENDER_FEATURE_ID)) suggestions.push({preset:"steel",title:"Steel Defender",sub:"Battle Smith feature detected in Aurora"});
  if(activeIds.includes(PRIMAL_COMPANION_FEATURE_ID)) suggestions.push({preset:"primal",title:"Primal Companion",sub:"Beast Master feature detected in Aurora"});
  if(activeIds.includes(DRAKE_COMPANION_FEATURE_ID)) suggestions.push({preset:"drake",title:"Drake Companion",sub:"Drakewarden feature detected in Aurora"});
  if(activeIds.includes(WILDFIRE_SPIRIT_FEATURE_ID)) suggestions.push({preset:"wildfire",title:"Wildfire Spirit",sub:"Circle of Wildfire feature detected in Aurora"});
  if(activeIds.includes(PACT_CHAIN_ID)) suggestions.push({preset:"chain",title:"Pact of the Chain Familiar",sub:"Detected from your Warlock invocation"});
  else if(auroraHasSpell(owner,FIND_FAMILIAR_ID)) suggestions.push({preset:"familiar",title:"Find Familiar",sub:"Detected in Aurora spells"});
  q("#companionSuggestions").innerHTML=suggestions.length
    ? `<div class="muted small companion-suggestion-title">AVAILABLE FROM AURORA</div>${suggestions.map(x=>`<button class="companion-suggestion" data-companion-preset="${x.preset}" type="button"><span><strong>${escapeHtml(x.title)}</strong><small>${escapeHtml(x.sub)}</small></span><span>Create →</span></button>`).join("")}`
    : `<div class="muted small">No companion spell/feature was auto-detected. You can still add any preset manually.</div>`;
  q("#companionSuggestions").querySelectorAll("[data-companion-preset]").forEach(b=>b.onclick=()=>openAddCompanion(b.dataset.companionPreset));

  const box=q("#companionList");
  if(!list.length){
    box.innerHTML='<div class="empty-encounter"><strong>No companions yet.</strong><div class="muted small top-space">Add a familiar, class companion, summoned companion, or custom minion.</div></div>';
    return;
  }
  box.innerHTML=list.map(comp=>{
    const calc=companionComputed(comp);
    const inEncounter=!!companionEncounterCombatant(comp);
    return `<article class="companion-card" data-companion-id="${escapeHtml(comp.id)}">
      <div class="companion-card-head"><div><h3>${escapeHtml(comp.name)}</h3><div class="muted small">${escapeHtml(companionSubtitle(comp))}</div></div><span class="pill">AC ${calc.ac}</span></div>
      <div class="companion-vitals">
        <div><span class="muted small">HP</span><strong>${comp.hp.current} / ${comp.hp.max}</strong></div>
        <div><span class="muted small">Speed</span><strong>${escapeHtml(calc.speed||"—")}</strong></div>
        <div><span class="muted small">Type</span><strong>${escapeHtml(calc.type||"—")}</strong></div>
      </div>
      <div class="companion-inline-details top-space">
        ${companionScalingHtml(comp,calc)?`<div class="companion-owner-scaling">${companionScalingHtml(comp,calc)}</div>`:""}
        <div class="companion-stat-block top-space">${companionStatBlockHtml(comp,calc,{includeDescription:false,includeNotes:false})}</div>
      </div>
      <div class="row gap wrap top-space companion-hp-actions">
        <button class="danger small-btn comp-damage" type="button">Damage</button>
        <button class="heal small-btn comp-heal" type="button">Heal</button>
        <button class="secondary small-btn comp-reset" type="button">Re-summon / Reset</button>
      </div>
      <div class="row gap wrap top-space">
        <button class="secondary small-btn comp-rename" type="button">Rename</button>
        <button class="secondary small-btn comp-notes" type="button">Notes</button>
        <button class="primary small-btn comp-encounter" type="button" ${inEncounter?"disabled":""}>${inEncounter?"In Encounter":"+ Encounter"}</button>
        <button class="danger ghost small-btn comp-delete" type="button">Remove</button>
      </div>
    </article>`;
  }).join("");
  box.querySelectorAll("[data-companion-id]").forEach(card=>{
    const id=card.dataset.companionId;
    card.querySelector(".comp-damage").onclick=()=>adjustCompanionHp(id,-1);
    card.querySelector(".comp-heal").onclick=()=>adjustCompanionHp(id,1);
    card.querySelector(".comp-reset").onclick=()=>resetCompanion(id);
    card.querySelector(".comp-rename").onclick=()=>renameCompanion(id);
    card.querySelector(".comp-notes").onclick=()=>editCompanionNotes(id);
    card.querySelector(".comp-encounter").onclick=()=>addCompanionToEncounter(id);
    card.querySelector(".comp-delete").onclick=()=>deleteCompanion(id);
  });
}
function adjustCompanionHp(id,direction){
  const comp=getCompanion(id); if(!comp) return;
  const raw=prompt(`${direction<0?"Damage":"Healing"} for ${comp.name}:`,"1");
  if(raw===null) return;
  const amount=Math.max(0,Math.floor(Number(raw)||0)); if(!amount) return;
  if(direction<0){
    let left=amount;
    if(comp.hp.temp>0){ const absorb=Math.min(comp.hp.temp,left); comp.hp.temp-=absorb; left-=absorb; }
    comp.hp.current=clamp(comp.hp.current-left,0,comp.hp.max);
  }else comp.hp.current=clamp(comp.hp.current+amount,0,comp.hp.max);
  const combatant=companionEncounterCombatant(comp);
  if(combatant){
    if(comp.hp.current===0 && combatant.status==="normal") combatant.status="down";
    if(comp.hp.current>0 && combatant.status==="down") combatant.status="normal";
  }
  renderCompanions(); renderEncounter(); saveState();
}
function resetCompanion(id){
  const comp=getCompanion(id); if(!comp) return;
  if(comp.presetType==="homunculus"){
    const raw=prompt("Spell slot level used to summon the Homunculus:",String(comp.summonLevel||2));
    if(raw===null) return;
    comp.summonLevel=Math.max(2,Math.min(9,Number(raw)||2));
  }
  syncCompanionDerivedHp(comp); comp.hp.current=comp.hp.max; comp.hp.temp=0;
  const combatant=companionEncounterCombatant(comp); if(combatant && combatant.status==="down") combatant.status="normal";
  renderCompanions(); renderEncounter(); saveState();
}
function renameCompanion(id){
  const comp=getCompanion(id); if(!comp) return;
  const name=prompt("Companion name:",comp.name); if(!name?.trim()) return;
  comp.name=name.trim();
  const ec=companionEncounterCombatant(comp); if(ec) ec.name=comp.name;
  renderCompanions(); renderEncounter(); saveState();
}
function editCompanionNotes(id){
  const comp=getCompanion(id); if(!comp) return;
  const notes=prompt("Companion notes:",comp.notes||"");
  if(notes===null) return;
  comp.notes=notes;
  renderCompanions(); saveState();
}
function deleteCompanion(id){
  const comp=getCompanion(id); if(!comp) return;
  if(!confirm(`Remove ${comp.name}?`)) return;
  state.companions=state.companions.filter(x=>x.id!==id);
  encounter().combatants=encounter().combatants.filter(x=>x.linkedCompanionId!==id);
  renderCompanions(); renderEncounter(); saveState();
}
function addCompanionToEncounter(id){
  const comp=getCompanion(id); if(!comp || companionEncounterCombatant(comp)) return;
  const owner=companionOwner(comp);
  const ownerCombatant=encounter().combatants.find(c=>c.linkedCharacterId===owner?.id);
  const sharesOwner=companionSharesOwnerInitiative(comp);
  let initiative;

  if(sharesOwner && ownerCombatant){
    initiative=ownerCombatant.initiative;
  }else{
    const hint=sharesOwner
      ?" (uses its owner's initiative; add the owner first to set this automatically)"
      :"";
    const raw=prompt(`Initiative for ${comp.name}${hint}:`,ownerCombatant?String(ownerCombatant.initiative):"10");
    if(raw===null) return;
    initiative=Number(raw);
    if(!Number.isFinite(initiative)) return;
  }

  encounter().combatants.push({
    id:newUuid(),name:comp.name,initiative,type:"ally",linkedCharacterId:null,linkedCompanionId:comp.id,
    damageTaken:0,damageHistory:[],status:comp.hp.current===0?"down":"normal",conditions:[],concentration:"",notes:""
  });
  sortEncounterCombatants();
  syncEncounterOpeningTurn();
  if(!encounter().currentId) encounter().currentId=encounter().combatants[0]?.id||null;
  renderCompanions(); renderEncounter(); saveState();
}
function abilityMod(score){ const n=Number(score)||0; const m=Math.floor((n-10)/2); return `${n} (${m>=0?"+":""}${m})`; }
function detailSection(title,items){
  if(!items?.length) return "";
  return `<h4>${escapeHtml(title)}</h4>${items.map(x=>`<div class="companion-feature"><strong><em>${escapeHtml(x.name)}.</em></strong> ${x.description||x.sheet||""}</div>`).join("")}`;
}
function companionScalingHtml(comp,calc=companionComputed(comp)){
  if(comp.presetType==="homunculus"){
    return `<strong>Owner-linked values</strong><div class="top-space small">Spell level <b>${comp.summonLevel}</b> • PB <b>+${calc.proficiency}</b> • Force Strike <b>${signedNumber(calc.spellAttack)} to hit</b>, 1d6 + ${comp.summonLevel} Force • Magic Bond <b>+${comp.summonLevel}</b> to checks and saves.</div><div class="muted small top-space">Uses your Initiative and is placed immediately after you in the tracker.</div>`;
  }

  if(comp.presetType==="steel"){
    const rendBonus=2+calc.intMod;
    return `<strong>Battle Smith scaling</strong><div class="top-space small">Artificer <b>${calc.artificerLevel||"—"}</b> • PB <b>+${calc.proficiency}</b> • INT <b>${signedNumber(calc.intMod)}</b> • AC <b>${calc.ac}</b> • HP <b>${calc.maxHp}</b>.<br>Force-Empowered Rend: <b>${signedNumber(calc.spellAttack)} to hit</b>, 1d8 + ${rendBonus} Force. Repair: 2d8 ${calc.intMod>=0?"+":"−"} ${Math.abs(calc.intMod)} HP, 3/Day.</div><div class="muted small top-space">Acts during your turn; represented immediately after you on the same Initiative.</div>`;
  }

  if(comp.presetType==="primal"){
    let damage="See Beast's Strike";
    if(comp.formId===PRIMAL_LAND_ID) damage=`1d8 + ${2+calc.wisMod}`;
    if(comp.formId===PRIMAL_SEA_ID) damage=`1d6 + ${2+calc.wisMod}`;
    if(comp.formId===PRIMAL_SKY_ID) damage=`1d4 + ${3+calc.wisMod}`;
    const upgrades=[];
    if(calc.rangerLevel>=7) upgrades.push("Exceptional Training");
    if(calc.rangerLevel>=11) upgrades.push("Bestial Fury");
    if(calc.rangerLevel>=15) upgrades.push("Share Spells");
    return `<strong>Beast Master scaling</strong><div class="top-space small">Ranger <b>${calc.rangerLevel||"—"}</b> • PB <b>+${calc.proficiency}</b> • WIS <b>${signedNumber(calc.wisMod)}</b> • AC <b>${calc.ac}</b> • HP <b>${calc.maxHp}</b>.<br>Beast's Strike: <b>${signedNumber(calc.spellAttack)} to hit</b>, ${damage}${upgrades.length?`.<br>Active upgrades: <b>${upgrades.join(", ")}</b>`:""}.</div><div class="muted small top-space">Acts during your turn; represented immediately after you on the same Initiative.</div>`;
  }

  if(comp.presetType==="drake"){
    const tier=calc.rangerLevel>=15?"Empowered Bite":calc.rangerLevel>=7?"Magic Fang":"Bite";
    const extra=calc.rangerLevel>=15?" + 2d6 essence":calc.rangerLevel>=7?" + 1d6 essence":"";
    return `<strong>Drakewarden scaling</strong><div class="top-space small">Ranger <b>${calc.rangerLevel||"—"}</b> • PB <b>+${calc.proficiency}</b> • ${escapeHtml(comp.damageType||"Fire")} essence • AC <b>${calc.ac}</b> • HP <b>${calc.maxHp}</b>.<br>${tier}: <b>${signedNumber(3+calc.proficiency)} to hit</b>, 1d6 + ${calc.proficiency} Piercing${extra}.</div><div class="muted small top-space">Shares your Initiative and takes its turn immediately after yours. Size/action tier updates automatically with Ranger level.</div>`;
  }

  if(comp.presetType==="wildfire"){
    return `<strong>Circle of Wildfire scaling</strong><div class="top-space small">Druid <b>${calc.druidLevel||"—"}</b> • PB <b>+${calc.proficiency}</b> • AC <b>${calc.ac}</b> • HP <b>${calc.maxHp}</b>.<br>Flame Seed: <b>${signedNumber(calc.spellAttack)} to hit</b>, 1d6 + ${calc.proficiency} Fire. Fiery Teleportation: save DC <b>${calc.spellDc}</b>, 1d6 + ${calc.proficiency} Fire.</div><div class="muted small top-space">Shares your Initiative and takes its turn immediately after yours.</div>`;
  }

  if(comp.presetType==="chain"){
    return `<strong>Pact of the Chain</strong><div class="small top-space">You can forgo one of your attacks to let the familiar make one attack with its Reaction.${calc.investment?` <b>Investment of the Chain Master detected:</b> save DC ${calc.spellDc}, optional Fly/Swim 40 ft., Bonus Action attack command, damage-type option, and your Resistance reaction apply.`:""}</div>`;
  }
  if(comp.presetType==="familiar"){
    return '<strong>Find Familiar</strong><div class="small top-space">The familiar rolls its own Initiative. Under the spell, it cannot attack, but it can take other actions and can deliver your touch spells with its Reaction.</div>';
  }
  return "";
}
function companionStatBlockHtml(comp,calc=companionComputed(comp),options={}){
  const def=calc.def;
  const includeDescription=options.includeDescription!==false;
  const includeNotes=options.includeNotes!==false;
  if(!def){
    return `<p>${escapeHtml((includeNotes&&comp.notes)||"Custom companion. Add any extra statistics or actions in its notes.").replace(/\n/g,"<br>")}</p>`;
  }
  const ab=def.abilities||{};
  const stats=[['STR',ab.strength],['DEX',ab.dexterity],['CON',ab.constitution],['INT',ab.intelligence],['WIS',ab.wisdom],['CHA',ab.charisma]];
  const lines=[];
  if(def.savingThrows) lines.push(`<b>Saving Throws</b> ${escapeHtml(def.savingThrows)}`);
  if(def.skills) lines.push(`<b>Skills</b> ${escapeHtml(def.skills)}`);
  if(def.vulnerabilities) lines.push(`<b>Damage Vulnerabilities</b> ${escapeHtml(def.vulnerabilities)}`);
  if(def.resistances) lines.push(`<b>Damage Resistances</b> ${escapeHtml(def.resistances)}`);
  if(def.immunities) lines.push(`<b>Damage Immunities</b> ${escapeHtml(def.immunities)}`);
  if(def.conditionImmunities) lines.push(`<b>Condition Immunities</b> ${escapeHtml(def.conditionImmunities)}`);
  if(def.senses) lines.push(`<b>Senses</b> ${escapeHtml(def.senses)}`);
  if(def.languages) lines.push(`<b>Languages</b> ${escapeHtml(def.languages)}`);
  return `
    ${includeDescription?(def.description||""):""}
    <div class="companion-ability-grid">${stats.map(([k,v])=>`<div><span>${k}</span><strong>${escapeHtml(abilityMod(v))}</strong></div>`).join("")}</div>
    <div class="companion-stat-lines">${lines.map(x=>`<div>${x}</div>`).join("")}</div>
    ${detailSection("Traits",def.traits)}${detailSection("Actions",def.actions)}${detailSection("Bonus Actions",def.bonusActions)}${detailSection("Reactions",def.reactions)}
    ${includeNotes&&comp.notes?`<h4>Notes</h4><p>${escapeHtml(comp.notes).replace(/\n/g,"<br>")}</p>`:""}`;
}
function showCompanionDetails(id){
  const comp=getCompanion(id); if(!comp) return;
  const calc=companionComputed(comp), def=calc.def;
  q("#companionDetailName").textContent=comp.name;
  q("#companionDetailSource").textContent=def?.source||"Custom companion";
  const tags=[calc.type,`AC ${calc.ac}`,`HP ${comp.hp.current}/${comp.hp.max}`,calc.speed].filter(Boolean);
  q("#companionDetailMeta").innerHTML=tags.map(x=>`<span class="mini-tag">${escapeHtml(x)}</span>`).join("");
  q("#companionOwnerScaling").innerHTML=companionScalingHtml(comp,calc);
  q("#companionOwnerScaling").classList.toggle("hidden",!q("#companionOwnerScaling").innerHTML.trim());
  q("#companionStatBlock").innerHTML=companionStatBlockHtml(comp,calc,{includeDescription:true,includeNotes:true});
  q("#companionDetailDialog").showModal();
}

q("#addCompanionBtn").onclick=()=>openAddCompanion("familiar");
q("#closeAddCompanionBtn").onclick=()=>q("#addCompanionDialog").close();
q("#companionPresetType").onchange=updateCompanionCreateForm;
q("#companionForm").onchange=()=>{
  const preset=q("#companionPresetType").value;
  setCompanionSpiritOptions(preset,window.AURORA_COMPANIONS?.[q("#companionForm").value]);
  updateCompanionCreatePreview();
};
q("#companionSpiritType").onchange=updateCompanionCreatePreview;
q("#companionSummonLevel").oninput=updateCompanionCreatePreview;
q("#companionDamageType").onchange=updateCompanionCreatePreview;
q("#companionName").oninput=updateCompanionCreatePreview;
q("#companionCreateNotes").oninput=updateCompanionCreatePreview;
["#customCompanionHp","#customCompanionAc","#customCompanionSpeed","#customCompanionType"].forEach(sel=>{
  const el=q(sel); if(el) el.oninput=updateCompanionCreatePreview;
});
q("#createCompanionBtn").onclick=createCompanionFromDialog;
q("#closeCompanionDetailBtn").onclick=()=>q("#companionDetailDialog").close();

function renderInventory(){
  const c=current();
  renderArmorClassDisplays();
  const items=inventoryFor(c)||[];
  q("#inventoryCharacterMeta").textContent=c?.aurora?`${c.name} • Synced with ${c.aurora.sourceFile||"Aurora"}`:`${c.name} • Local inventory`;
  const filter=String(q("#inventoryFilter")?.value||"").trim().toLowerCase();
  const sort=q("#inventorySort")?.value||"category";
  let groups=inventoryGroupRows(items).filter(g=>{
    if(!filter) return true;
    const text=[g.item.name,inventoryTitle(g.item),...(g.item.adorners||[]).map(a=>a.name),itemDisplayDef(g.item)?.category,itemDisplayDef(g.item)?.rarity].join(" ").toLowerCase();
    return text.includes(filter);
  });
  groups.sort((a,b)=>{
    if(sort==="name") return inventoryTitle(a.item).localeCompare(inventoryTitle(b.item));
    if(sort==="equipped") return Number(!!b.item.equipped)-Number(!!a.item.equipped)||inventoryTitle(a.item).localeCompare(inventoryTitle(b.item));
    return inventoryCategory(a.item).localeCompare(inventoryCategory(b.item))||inventoryTitle(a.item).localeCompare(inventoryTitle(b.item));
  });

  q("#inventoryItemCount").textContent=`${items.length} item${items.length===1?"":"s"}`;
  const weight=items.reduce((sum,it)=>sum+itemWeightLb(it),0);
  q("#inventoryWeight").textContent=`${Number(weight.toFixed(2))} lb.`;
  const attuned=items.filter(it=>it.attuned).length;
  q("#inventoryAttunement").textContent=`Attuned ${attuned} / 3`;

  const dirty=auroraInventoryDirty(c);
  const status=q("#inventorySyncStatus");
  if(c.aurora){
    status.textContent=dirty?"Inventory changed in app • Save to Aurora to write back":"Inventory matches Aurora";
    status.classList.toggle("sync-dirty",dirty);
    q("#resetInventoryBtn").disabled=!dirty;
    q("#inventorySaveAuroraBtn").disabled=!c.aurora.sourceUri || !window.AuroraBridge?.writeDocument;
  }else{
    status.textContent="Stored locally";
    status.classList.remove("sync-dirty");
    q("#resetInventoryBtn").disabled=true;
    q("#inventorySaveAuroraBtn").disabled=true;
  }

  const box=q("#inventoryList");
  if(!groups.length){
    box.innerHTML=`<div class="empty-encounter"><strong>${filter?"No matching items":"Inventory is empty"}.</strong><div class="muted small top-space">Use + Add Item to add equipment from Aurora's database.</div></div>`;
    updateSaveAuroraButton(); return;
  }
  let lastCategory="";
  box.innerHTML=groups.map(g=>{
    const it=g.item,cat=inventoryCategory(it),title=inventoryTitle(it),def=itemDisplayDef(it)||itemDef(it.id);
    const heading=sort==="category"&&cat!==lastCategory ? `<div class="inventory-section-heading"><span>${escapeHtml(cat)}</span></div>` : "";
    lastCategory=cat;
    const badges=[];
    if((it.adorners||[]).length) badges.push("Magic");
    if(def?.elementType==="Magic Item") badges.push("Magic Item");
    if(def?.attunement) badges.push(it.attuned?"Attuned":"Attunement");
    if(it.equipped) badges.push("Equipped");
    return `${heading}<div class="inventory-row" data-inventory-id="${escapeHtml(it.identifier)}">
      <button type="button" class="inventory-item-main">
        <div class="resource-title-row"><div class="resource-title">${escapeHtml(title)}</div>${badges.map(x=>`<span class="mini-tag">${escapeHtml(x)}</span>`).join("")}</div>
        ${title!==it.name?`<div class="muted small">${escapeHtml(it.name)} • ${escapeHtml(inventorySubtitle(it,g.instances.length))}</div>`:`<div class="muted small">${escapeHtml(inventorySubtitle(it,g.instances.length))}</div>`}
      </button>
      <div class="inventory-row-actions">
        ${g.instances.length>1?`<span class="inventory-qty">×${g.instances.length}</span>`:""}
        <button type="button" class="secondary item-info-btn">Info</button>
        <button type="button" class="secondary item-manage-btn">Manage</button>
      </div>
    </div>`;
  }).join("");
  box.querySelectorAll("[data-inventory-id]").forEach(row=>{
    const id=row.dataset.inventoryId;
    row.querySelector(".inventory-item-main").onclick=()=>showInventoryItemDetails(id);
    row.querySelector(".item-info-btn").onclick=()=>showInventoryItemDetails(id);
    row.querySelector(".item-manage-btn").onclick=()=>openManageInventoryItem(id);
  });
  updateSaveAuroraButton();
}

function descriptionForItemDef(def){
  return def?.description || '<p class="muted">No Aurora description is available for this item.</p>';
}
function showInventoryItemDetails(identifier){
  const item=(inventoryFor()||[]).find(x=>x.identifier===identifier);
  if(!item) return;
  const base=itemDef(item.id);
  const display=itemDisplayDef(item)||base;
  q("#itemDetailName").textContent=inventoryTitle(item);
  q("#itemDetailSource").textContent=display?.source||base?.source||"";
  const meta=[];
  if(display?.category) meta.push(display.category);
  if(display?.itemType) meta.push(display.itemType);
  else if(display?.elementType) meta.push(display.elementType);
  if(display?.rarity) meta.push(display.rarity);
  if(base?.weight) meta.push(`Weight: ${base.weight}`);
  if(display?.costAmount && Number(display.costAmount)>0) meta.push(`Value: ${display.costAmount} ${String(display.costCurrency||"").toUpperCase()}`);
  if(display?.attunement) meta.push("Requires Attunement");
  if(item.equipped) meta.push(`Equipped${item.location?": "+item.location:""}`);
  q("#itemDetailMeta").innerHTML=meta.map(x=>`<span class="mini-tag">${escapeHtml(x)}</span>`).join("");
  const lastAdorner=(item.adorners||[]).length ? item.adorners[item.adorners.length-1] : null;
  if(lastAdorner && !itemDef(lastAdorner.id)){
    q("#itemDetailDescription").innerHTML=`<p class="muted">The bundled Aurora content does not contain the definition for ${escapeHtml(lastAdorner.name)} (${escapeHtml(lastAdorner.id)}). The base-item description is shown below.</p>${descriptionForItemDef(base)}`;
  }else{
    q("#itemDetailDescription").innerHTML=descriptionForItemDef(display);
  }
  const mods=(item.adorners||[]).map(a=>itemDef(a.id)).filter(Boolean);
  q("#itemDetailMods").innerHTML=mods.length?`<h4>Magic modifications</h4>${mods.map(m=>`<div class="item-mod-detail"><strong>${escapeHtml(m.name)}</strong>${m!==display?m.description:""}</div>`).join("")}`:"";
  q("#itemDetailDialog").showModal();
}

function defaultEquipLocation(item){
  const def=itemDef(item.id);
  if(def?.elementType==="Armor") return /shield/i.test(def.name)?"Secondary Hand":"Armor";
  const slot=String(def?.slot||"").toLowerCase();
  const map={body:"Armor",onehand:"Primary Hand",twohand:"Primary Hand",head:"Head",neck:"Neck",shoulders:"Shoulders",feet:"Feet",hands:"Hands",waist:"Waist",finger:"Finger"};
  return map[slot]||"Worn";
}
function openManageInventoryItem(identifier){
  const item=(inventoryFor()||[]).find(x=>x.identifier===identifier);
  if(!item) return;
  managedInventoryIdentifier=identifier;
  const def=itemDisplayDef(item)||itemDef(item.id);
  q("#manageItemName").textContent=inventoryTitle(item);
  q("#manageItemSub").textContent=[item.name!==inventoryTitle(item)?item.name:"",def?.source||""].filter(Boolean).join(" • ");
  q("#manageItemEquipped").value=item.equipped?"true":"false";
  const locationSelect=q("#manageItemLocation");
  if(item.location && ![...locationSelect.options].some(o=>o.value===item.location)){
    const option=document.createElement("option"); option.value=item.location; option.textContent=item.location; locationSelect.appendChild(option);
  }
  locationSelect.value=item.location||"";
  locationSelect.disabled=!item.equipped;
  q("#manageItemAttuned").checked=!!item.attuned;
  q("#manageAttunedRow").classList.toggle("hidden",!def?.attunement);
  const maxCharges=Math.max(0,Number(def?.charges)||0);
  q("#manageChargesRow").classList.toggle("hidden",!maxCharges);
  q("#manageChargesMax").textContent=maxCharges?`/ ${maxCharges}`:"";
  q("#manageItemCharges").max=String(maxCharges||999);
  q("#manageItemCharges").value=item.chargesCurrent??maxCharges;
  q("#manageItemNotes").value=item.notes||"";
  const mods=item.adorners||[];
  q("#manageItemMods").innerHTML=mods.length?`<strong>Magic modifications</strong><div class="stack top-space">${mods.map((a,i)=>`<div class="inventory-mod-row"><span>${escapeHtml(a.name)}</span><button type="button" class="danger ghost remove-mod-btn" data-mod-index="${i}">Remove</button></div>`).join("")}</div>`:"";
  q("#manageItemMods").querySelectorAll(".remove-mod-btn").forEach(btn=>btn.onclick=()=>{
    item.adorners.splice(Number(btn.dataset.modIndex),1); saveState(); renderInventory(); openManageInventoryItem(identifier);
  });
  q("#manageItemDialog").showModal();
}
function saveManagedInventoryItem(){
  const item=(inventoryFor()||[]).find(x=>x.identifier===managedInventoryIdentifier);
  if(!item) return;
  item.equipped=q("#manageItemEquipped").value==="true";
  item.location=item.equipped?(q("#manageItemLocation").value||defaultEquipLocation(item)):"";
  item.sidebar=item.equipped||item.sidebar;
  item.attuned=q("#manageItemAttuned").checked;
  const def=itemDisplayDef(item)||itemDef(item.id);
  if(Number(def?.charges)>0) item.chargesCurrent=clamp(Number(q("#manageItemCharges").value)||0,0,Number(def.charges));
  item.notes=q("#manageItemNotes").value||"";
  q("#manageItemDialog").close(); renderInventory(); saveState();
}
function removeOneManagedItem(){
  const list=inventoryFor();
  const idx=list.findIndex(x=>x.identifier===managedInventoryIdentifier);
  if(idx<0) return;
  const item=list[idx];
  if(!confirm(`Remove ${inventoryTitle(item)} from inventory?`)) return;
  list.splice(idx,1); q("#manageItemDialog").close(); renderInventory(); saveState();
}
function duplicateManagedItem(){
  const list=inventoryFor(); const item=list.find(x=>x.identifier===managedInventoryIdentifier); if(!item) return;
  const copy=deepClone(item); copy.identifier=newUuid(); copy.equipped=false; copy.location=""; copy.sidebar=false; copy.attuned=false;
  list.push(copy); renderInventory(); saveState();
}
function itemCatalogKeyText(value=""){
  return String(value||"").trim().toLowerCase().replace(/\s+/g," ");
}
function itemCatalogDedupeKey(d){
  // Treat reprints / playtest predecessors as the same picker entry when their
  // meaningful item shape matches. Deliberately exclude source, price, weight
  // and description so the current published/2024 definition can replace an
  // older printing without producing a second row.
  return [
    d.name,d.elementType,d.category,d.itemType,d.rarity,
    d.isAdorner?"adorner":"standalone",d.baseKind,d.addition,d.baseRequirement,
    d.attunement?"attunement":"",d.charges,d.slot
  ].map(itemCatalogKeyText).join("|");
}
function itemCatalogSourceScore(d){
  const source=String(d?.source||"");
  const id=String(d?.id||"");
  let score=100;
  // Published material should replace its UA/playtest predecessor.
  if(/unearthed arcana/i.test(source)||/_UA\d*/i.test(id)) score-=1000;
  // Prefer the revised 2024 core books when both editions expose the same item.
  if(/\(2024\)/i.test(source)||/(PHB24|DMG24)/i.test(id)) score+=500;
  // Forge of the Artificer is the current published artificer source used by this build.
  if(/Eberron:\s*Forge of the Artificer/i.test(source)||/_EFOTA_/i.test(id)) score+=450;
  return score;
}
function dedupeItemCatalog(defs){
  const best=new Map();
  for(const d of defs){
    const key=itemCatalogDedupeKey(d);
    const current=best.get(key);
    if(!current || itemCatalogSourceScore(d)>itemCatalogSourceScore(current) ||
       (itemCatalogSourceScore(d)===itemCatalogSourceScore(current) && String(d.id).localeCompare(String(current.id))<0)){
      best.set(key,d);
    }
  }
  return [...best.values()];
}
function itemSearchResults(){
  const query=String(q("#addItemSearch").value||"").trim().toLowerCase();
  const type=q("#addItemTypeFilter").value;
  let defs=Object.values(window.AURORA_ITEMS||{}).filter(d=>{
    if(type!=="all"&&d.elementType!==type) return false;
    if(!query) return ["Weapon","Armor","Item","Magic Item"].includes(d.elementType) && !d.isAdorner;
    const hay=[d.name,d.category,d.itemType,d.rarity,d.source].join(" ").toLowerCase();
    return hay.includes(query);
  });
  defs=dedupeItemCatalog(defs).sort((a,b)=>{
    if(query){
      const ax=a.name.toLowerCase().startsWith(query)?0:1,bx=b.name.toLowerCase().startsWith(query)?0:1;
      if(ax!==bx) return ax-bx;
    }
    return a.name.localeCompare(b.name) || itemCatalogSourceScore(b)-itemCatalogSourceScore(a);
  }).slice(0,50);

  // Only show the source when genuinely distinct variants with the same name remain.
  const nameCounts=new Map();
  for(const d of defs){
    const key=itemCatalogKeyText(d.name);
    nameCounts.set(key,(nameCounts.get(key)||0)+1);
  }
  q("#addItemResults").innerHTML=defs.length?defs.map(d=>{
    const showSource=(nameCounts.get(itemCatalogKeyText(d.name))||0)>1;
    const bits=[d.elementType,d.category,d.rarity,showSource?d.source:"",d.weight].filter(Boolean).join(" • ");
    return `<button type="button" class="item-search-row" data-item-id="${escapeHtml(d.id)}"><span><strong>${escapeHtml(d.name)}</strong><span class="muted small item-search-meta">${escapeHtml(bits)}</span></span><span>${d.isAdorner?"Apply":"Add"}</span></button>`;
  }).join(""):PUBLIC_EDITION?'<div class="muted small">The full item catalogue is not distributed with the public web edition. Items already present in an imported character remain visible.</div>':'<div class="muted small">No matching Aurora items.</div>';
  q("#addItemResults").querySelectorAll("[data-item-id]").forEach(btn=>btn.onclick=()=>addItemDefinition(btn.dataset.itemId));
}
function eligibleAdornerTargets(def){
  return (inventoryFor()||[]).filter(it=>{
    const base=itemDef(it.id);
    if(!base) return false;
    if(def.baseKind==="armor" && base.elementType!=="Armor") return false;
    if(def.baseKind==="weapon" && base.elementType!=="Weapon") return false;
    if(/shield/i.test(def.addition||"") && !/shield/i.test(base.name)) return false;
    return !(it.adorners||[]).some(a=>a.id===def.id);
  });
}
function addItemDefinition(id){
  const def=itemDef(id); if(!def) return;
  if(def.isAdorner){
    const targets=eligibleAdornerTargets(def);
    if(!targets.length){ alert(`Carry a compatible ${def.baseKind||"base"} item first, then apply ${def.name}.`); return; }
    let choice=0;
    if(targets.length>1){
      const answer=prompt(`Apply ${def.name} to which item?\n${targets.map((t,i)=>`${i+1}. ${inventoryTitle(t)} (${t.name})`).join("\n")}\n\nEnter a number:`,`1`);
      if(answer===null) return; choice=Number(answer)-1;
      if(choice<0||choice>=targets.length){ alert("That selection was not valid."); return; }
    }
    targets[choice].adorners.push({name:def.name,id:def.id});
    if(Number(def.charges)>0) targets[choice].chargesCurrent=Number(def.charges);
    q("#addItemDialog").close(); renderInventory(); saveState(); return;
  }
  const qty=clamp(Math.floor(Number(q("#addItemQuantity").value)||1),1,99);
  const list=inventoryFor();
  for(let i=0;i<qty;i++) list.push(normalizeInventoryItem({identifier:newUuid(),name:def.name,id:def.id,chargesCurrent:Number(def.charges)>0?Number(def.charges):null}));
  q("#addItemDialog").close(); renderInventory(); saveState();
}
function resetInventoryToAurora(){
  const a=current().aurora; if(!a?.importEquipment) return;
  if(!confirm("Discard inventory changes made in the app and restore the last Aurora inventory?")) return;
  a.equipment=deepClone(a.importEquipment).map(normalizeInventoryItem); renderInventory(); saveState();
}

q("#inventoryFilter").oninput=renderInventory;
q("#inventorySort").onchange=renderInventory;
q("#addInventoryItemBtn").onclick=()=>{q("#addItemSearch").value="";q("#addItemQuantity").value="1";q("#addItemTypeFilter").value="all";itemSearchResults();q("#addItemDialog").showModal();setTimeout(()=>q("#addItemSearch").focus(),50);};
q("#addItemSearch").oninput=itemSearchResults;
q("#addItemTypeFilter").onchange=itemSearchResults;
q("#closeAddItemBtn").onclick=()=>q("#addItemDialog").close();
q("#closeItemDetailBtn").onclick=()=>q("#itemDetailDialog").close();
q("#closeManageItemBtn").onclick=()=>q("#manageItemDialog").close();
q("#manageItemEquipped").onchange=()=>{q("#manageItemLocation").disabled=q("#manageItemEquipped").value!=="true";};
q("#saveManagedItemBtn").onclick=saveManagedInventoryItem;
q("#removeManagedItemBtn").onclick=removeOneManagedItem;
q("#duplicateManagedItemBtn").onclick=duplicateManagedItem;
q("#viewManagedItemBtn").onclick=()=>{const id=managedInventoryIdentifier;q("#manageItemDialog").close();showInventoryItemDetails(id);};
q("#resetInventoryBtn").onclick=resetInventoryToAurora;
q("#inventorySaveAuroraBtn").onclick=()=>q("#saveAuroraBtn").click();

function resetPreparedToAurora(){
  const a=current().aurora;
  if(!a?.allSpells?.length) return;
  for(const s of a.allSpells){
    if(s.alwaysPrepared||s.known) continue;
    const key=s.id||s.name;
    if(Object.prototype.hasOwnProperty.call(a.importPrepared||{},key)) s.prepared=!!a.importPrepared[key];
  }
  a.spells=a.allSpells.filter(s=>s.prepared||s.alwaysPrepared||s.known);
  renderAuroraProfile(); saveState();
}
q("#resetPreparedBtn").onclick=resetPreparedToAurora;

function regexEscape(value=""){
  return String(value).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
}
function patchCurrencyXml(xml,currency){
  const m=xml.match(/<currency>([\s\S]*?)<\/currency>/i);
  if(!m) throw new Error("Aurora currency block was not found.");
  let block=m[0];
  const tags={cp:"copper",sp:"silver",ep:"electrum",gp:"gold",pp:"platinum"};
  for(const [key,tag] of Object.entries(tags)){
    const value=Math.max(0,Math.floor(Number(currency?.[key])||0));
    const rx=new RegExp(`(<${tag}>)[\\s\\S]*?(<\\/${tag}>)`,`i`);
    if(!rx.test(block)) throw new Error(`Aurora ${tag} field was not found.`);
    block=block.replace(rx,`$1${value}$2`);
  }
  return xml.slice(0,m.index)+block+xml.slice(m.index+m[0].length);
}
function setPreparedAttribute(tag,prepared){
  if(/always-prepared="true"/i.test(tag)||/known="true"/i.test(tag)) return tag;
  tag=tag.replace(/\s+prepared="[^"]*"/i,"");
  if(prepared) tag=tag.replace(/\s*\/>$/, ' prepared="true" />');
  return tag;
}
function patchPreparedXml(xml,aurora){
  let result=xml;
  for(const spell of (aurora?.allSpells||[])){
    if(!spell.id || spell.alwaysPrepared || spell.known) continue;
    const id=regexEscape(spell.id);
    const rx=new RegExp(`<spell\\b(?=[^>]*\\bid="${id}")[^>]*\\/>`,`i`);
    const match=result.match(rx);
    if(!match) continue;
    const updated=setPreparedAttribute(match[0],!!spell.prepared);
    if(updated!==match[0]) result=result.replace(rx,updated);
  }
  return result;
}

function xmlEscape(value=""){
  return String(value).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[ch]));
}
function equipmentItemXml(item){
  const attrs=[`identifier="${xmlEscape(item.identifier||newUuid())}"`,`name="${xmlEscape(item.name||"Item")}"`,`id="${xmlEscape(item.id||"")}"`];
  if(item.sidebar||item.equipped) attrs.push('sidebar="true"');
  const lines=[`\t\t\t<item ${attrs.join(" ")}>`];
  if(item.equipped) lines.push(`\t\t\t\t<equipped location="${xmlEscape(item.location||defaultEquipLocation(item))}">true</equipped>`);
  if((item.adorners||[]).length){
    lines.push(`\t\t\t\t<items>`);
    for(const a of item.adorners) lines.push(`\t\t\t\t\t<adorner name="${xmlEscape(a.name)}" id="${xmlEscape(a.id)}" />`);
    lines.push(`\t\t\t\t</items>`);
  }
  lines.push(`\t\t\t\t<details card="true">`);
  lines.push(`\t\t\t\t\t<name>`);
  lines.push(`\t\t\t\t\t</name>`);
  lines.push(`\t\t\t\t\t<notes>${xmlEscape(item.notes||"")}</notes>`);
  lines.push(`\t\t\t\t</details>`);
  lines.push(`\t\t\t</item>`);
  return lines.join("\n");
}
function patchEquipmentXml(xml,equipment){
  const buildStart=xml.search(/<build(?:\s|>)/i);
  if(buildStart<0) throw new Error("Aurora build block was not found.");
  const companionEnd=xml.indexOf("</companion>",buildStart);
  if(companionEnd<0) throw new Error("Aurora companion block was not found before equipment.");
  const start=xml.indexOf("<equipment>",companionEnd);
  if(start<0) throw new Error("Aurora equipment block was not found.");
  const endClose=xml.indexOf("</equipment>",start);
  if(endClose<0) throw new Error("Aurora equipment closing tag was not found.");
  const end=endClose+"</equipment>".length;
  const block=[`<equipment>`,`\t\t\t<storage name="#1" />`,`\t\t\t<storage name="#2" />`,...(equipment||[]).map(equipmentItemXml),`\t\t</equipment>`].join("\n");
  return xml.slice(0,start)+block+xml.slice(end);
}

function stripTrackerNotesBlockRaw(inner=""){
  let out=String(inner||"");
  const markerPairs=[
    [TRACKER_NOTES_START,TRACKER_NOTES_END],
    [xmlEscape(TRACKER_NOTES_START),xmlEscape(TRACKER_NOTES_END)]
  ];
  for(const [startMarker,endMarker] of markerPairs){
    while(true){
      const start=out.indexOf(startMarker);
      if(start<0) break;
      const end=out.indexOf(endMarker,start+startMarker.length);
      if(end<0){ out=out.slice(0,start); break; }
      out=out.slice(0,start)+out.slice(end+endMarker.length);
    }
  }
  return out.replace(/\n{3,}/g,"\n\n").trim();
}
function patchJournalNotesXml(xml,notes){
  const buildStart=xml.search(/<build(?:\s|>)/i);
  if(buildStart<0) throw new Error("Aurora build block was not found.");
  const inputStart=xml.indexOf("<input",buildStart);
  if(inputStart<0) throw new Error("Aurora input block was not found.");
  const inputEnd=xml.indexOf("</input>",inputStart);
  if(inputEnd<0) throw new Error("Aurora input closing tag was not found.");
  const notesStart=xml.indexOf("<notes",inputStart);
  if(notesStart<0 || notesStart>inputEnd) throw new Error("Aurora character notes block was not found.");
  const notesOpenEnd=xml.indexOf(">",notesStart);
  const notesClose=xml.indexOf("</notes>",notesOpenEnd);
  if(notesClose<0 || notesClose>inputEnd) throw new Error("Aurora character notes closing tag was not found.");
  let block=xml.slice(notesStart,notesClose+"</notes>".length);
  const serialized=serializeJournalNotes(notes||[]);
  const encoded=xmlEscape(serialized);
  const rightRx=/<note\b(?=[^>]*\bcolumn=["']right["'])[^>]*>([\s\S]*?)<\/note>/i;
  const rightSelfRx=/<note\b(?=[^>]*\bcolumn=["']right["'])[^>]*\/\s*>/i;
  const match=block.match(rightRx);
  if(match){
    const cleaned=stripTrackerNotesBlockRaw(match[1]);
    const inner=(cleaned?cleaned+"\n\n":"")+encoded;
    block=block.replace(rightRx,match[0].replace(match[1],inner));
  }else if(rightSelfRx.test(block)){
    block=block.replace(rightSelfRx,`<note column="right">${encoded}</note>`);
  }else{
    block=block.replace(/<\/notes>$/i,`\n\t\t\t\t<note column="right">${encoded}</note>\n\t\t\t</notes>`);
  }
  return xml.slice(0,notesStart)+block+xml.slice(notesClose+"</notes>".length);
}

function validateAuroraXml(xml){
  const doc=new DOMParser().parseFromString(xml,"application/xml");
  if(doc.querySelector("parsererror")||doc.documentElement.tagName!=="character"){
    throw new Error("The edited file failed XML validation, so it was not saved.");
  }
}
function auroraWritebackDirty(c){
  if(!c?.aurora) return false;
  const currencyDirty=!currencyEquals(c.currency,c.aurora.currency);
  const spellsDirty=(c.aurora.allSpells||[]).some(s=>{
    const key=s.id||s.name;
    return !s.alwaysPrepared&&!s.known && !!s.prepared!==!!c.aurora.importPrepared?.[key];
  });
  const inventoryDirty=!equipmentEquals(c.aurora.equipment,c.aurora.importEquipment);
  const notesDirty=!journalNotesEqual(c.journalNotes||[],c.aurora.importJournalNotes||[]);
  return currencyDirty||spellsDirty||inventoryDirty||notesDirty;
}
function updateSaveAuroraButton(){
  const btn=q("#saveAuroraBtn");
  const c=current();
  if(!btn) return;
  const canWrite=!!c?.aurora?.sourceUri && !!window.AuroraBridge?.writeDocument;
  btn.disabled=!canWrite;
  btn.textContent=auroraWritebackDirty(c)?"Save Changes to Aurora":"Save to Aurora";
}

q("#saveAuroraBtn").onclick=()=>{
  const c=current();
  const a=c?.aurora;
  if(!a?.sourceUri){
    alert("Re-import this Aurora character once so the app can remember permission to its .dnd5e file.");
    return;
  }
  if(!window.AuroraBridge?.readDocument || !window.AuroraBridge?.writeDocument){
    alert("Direct Aurora saving is available in the Android app build only.");
    return;
  }
  if(!auroraWritebackDirty(c)){
    alert("Prepared spells, currency, inventory and character notes already match the last Aurora baseline.");
    return;
  }
  if(!confirm("Save prepared spells, currency, inventory and character notes to the selected Aurora .dnd5e file? The app will make an internal backup before overwriting it.")) return;

  try{
    const raw=window.AuroraBridge.readDocument(a.sourceUri);
    if(!raw || raw.startsWith("__AURORA_READ_ERROR__")) throw new Error(raw?.replace("__AURORA_READ_ERROR__","")||"Could not read Aurora file.");
    let edited=patchPreparedXml(raw,a);
    edited=patchCurrencyXml(edited,c.currency);
    edited=patchEquipmentXml(edited,a.equipment||[]);
    edited=patchJournalNotesXml(edited,c.journalNotes||[]);
    validateAuroraXml(edited);

    const response=JSON.parse(window.AuroraBridge.writeDocument(a.sourceUri,edited));
    if(!response.ok) throw new Error(response.error||"Aurora file write failed.");

    a.importPrepared=Object.fromEntries((a.allSpells||[]).map(s=>[s.id||s.name,!!s.prepared]));
    a.currency={...c.currency};
    a.importEquipment=deepClone(a.equipment||[]);
    a.importJournalNotes=deepClone(c.journalNotes||[]);
    a.spells=(a.allSpells||[]).filter(s=>s.prepared||s.alwaysPrepared||s.known);
    a.lastSavedAt=new Date().toISOString();
    renderAll();
    alert(`Saved to Aurora successfully. Backup created: ${response.backup||"internal backup"}`);
  }catch(err){
    alert("Aurora save failed: "+(err?.message||"Unknown error"));
  }
};

q("#auroraImportInput").onchange=async e=>{
  const file=e.target.files?.[0];
  if(!file) return;
  try{
    const xml=await file.text();
    const data=parseAuroraCharacter(xml,file.name);
    applyAuroraImport(data);
  }catch(err){
    alert("Aurora import failed: "+(err?.message||"Unknown error"));
  }
  e.target.value="";
};

// Theme
q("#themeBtn").onclick=()=>{state.theme=state.theme==="dark"?"light":"dark";applyTheme();saveState()};

// Service worker
if("serviceWorker" in navigator && location.protocol.startsWith("http")){
  window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js",{updateViaCache:"none"}).then(reg=>reg.update()).catch(()=>{}));
}

renderAll();


// v1.5.4 — unified Encounter character/companion picker
function encounterOwnedRosterOptions(){
  const out=[];

  const chars=(state&&Array.isArray(state.characters))?state.characters:[];
  chars.forEach((c,i)=>{
    const id=c.id||c.uuid||c.auroraId||String(i);
    const name=c.name||c.characterName||("Character "+(i+1));
    out.push({
      key:"character:"+id,
      kind:"character",
      id,
      index:i,
      name
    });
  });

  const comps=(state&&Array.isArray(state.companions))?state.companions:[];
  comps.forEach((c,i)=>{
    const id=c.id||c.identifier||c.uuid||String(i);
    const name=c.name||c.formName||c.form||("Companion "+(i+1));
    out.push({
      key:"companion:"+id,
      kind:"companion",
      id,
      index:i,
      name
    });
  });

  return out;
}

function encounterLinkedRosterKeys(){
  const keys=new Set();
  const list=encounter().combatants||[];

  list.forEach(c=>{
    if(c.linkedCharacterId){
      keys.add("character:"+c.linkedCharacterId);
    }
    if(c.linkedCompanionId){
      keys.add("companion:"+c.linkedCompanionId);
    }
  });

  return keys;
}

function appendEncounterRosterGroup(select,label,items,linked){
  if(!items.length) return;

  const group=document.createElement("optgroup");
  group.label=label;

  items.forEach(r=>{
    const opt=document.createElement("option");
    opt.value=r.key;
    opt.textContent=r.name+(linked.has(r.key)?" — already added":"");
    opt.disabled=linked.has(r.key);
    group.appendChild(opt);
  });

  select.appendChild(group);
}

function renderEncounterRosterPicker(){
  const select=q("#encounterRosterSelect");
  const btn=q("#encounterRosterAddBtn");
  const hint=q("#encounterRosterHint");
  if(!select||!btn) return;

  const roster=encounterOwnedRosterOptions();
  const linked=encounterLinkedRosterKeys();
  const previous=select.value;

  select.innerHTML='<option value="">Select character or companion…</option>';

  appendEncounterRosterGroup(
    select,
    "Characters",
    roster.filter(r=>r.kind==="character"),
    linked
  );

  appendEncounterRosterGroup(
    select,
    "Companions",
    roster.filter(r=>r.kind==="companion"),
    linked
  );

  if(previous && [...select.options].some(o=>o.value===previous&&!o.disabled)){
    select.value=previous;
  }

  btn.disabled=!select.value;

  if(hint){
    const available=roster.filter(r=>!linked.has(r.key)).length;
    hint.textContent=roster.length
      ? (available
          ? available+" available to add."
          : "All of your characters and companions are already in this encounter.")
      : "Import an Aurora character or create a companion first.";
  }
}

function addCharacterToEncounterById(characterId){
  const c=(state.characters||[]).find(x=>x.id===characterId);
  if(!c) return false;

  const enc=encounter();
  if(enc.combatants.some(x=>x.linkedCharacterId===c.id)) return false;

  const initiativeText=prompt(`Initiative for ${c.name}:`,"10");
  if(initiativeText===null) return false;

  const initiative=Number(initiativeText);
  if(!Number.isFinite(initiative)) return false;

  const combatant={
    id:newUuid(),
    name:c.name,
    initiative,
    type:"ally",
    linkedCharacterId:c.id,
    linkedCompanionId:null,
    damageTaken:0,
    damageHistory:[],
    status:"normal",
    conditions:[],
    concentration:"",
    notes:""
  };

  enc.combatants.push(combatant);
  sortEncounterCombatants();
  syncEncounterOpeningTurn();
  if(!enc.currentId) enc.currentId=combatant.id;
  renderEncounter();
  saveState();
  return true;
}

function addSelectedEncounterRosterEntry(){
  const select=q("#encounterRosterSelect");
  if(!select||!select.value) return;

  const item=encounterOwnedRosterOptions().find(r=>r.key===select.value);
  if(!item) return;

  let added=false;

  if(item.kind==="character"){
    added=addCharacterToEncounterById(item.id);
  }else if(item.kind==="companion"){
    const before=encounter().combatants.length;

    // Important: addCompanionToEncounter expects the companion ID.
    addCompanionToEncounter(item.id);

    added=encounter().combatants.length>before;
  }

  if(added){
    select.value="";
  }

  renderEncounterRosterPicker();
}

function setupEncounterRosterPicker(){
  const select=q("#encounterRosterSelect");
  const btn=q("#encounterRosterAddBtn");

  if(select && !select.dataset.rosterListener){
    select.dataset.rosterListener="true";
    select.addEventListener("change",()=>{
      if(btn) btn.disabled=!select.value;
    });
  }

  if(btn && !btn.dataset.rosterListener){
    btn.dataset.rosterListener="true";
    btn.addEventListener("click",addSelectedEncounterRosterEntry);
  }

  renderEncounterRosterPicker();
}

if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded",setupEncounterRosterPicker);
}else{
  setupEncounterRosterPicker();
}
