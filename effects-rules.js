(function(root){
  "use strict";
  const CONDITION_DEFS={
    Blinded:{summary:"You cannot see; sight-based checks fail and attacks are affected.",description:"<p>You cannot see while Blinded. Checks that require sight fail, and attack rolls are affected depending on whether you are attacking or being attacked.</p>"},
    Charmed:{summary:"You cannot harm the charmer and they have an edge socially.",description:"<p>While Charmed, you cannot attack the creature that charmed you or target it with harmful abilities or magical effects. The charmer also has an advantage when interacting with you socially.</p>"},
    Deafened:{summary:"You cannot hear and fail checks that require hearing.",description:"<p>While Deafened, you cannot hear and fail ability checks that depend on hearing.</p>"},
    Exhaustion:{summary:"A cumulative penalty that worsens as the level rises.",description:"<p>Exhaustion has levels. Each level makes you less effective, and the highest level is fatal. Track the current level with the counter.</p>",counter:true,counterMax:6},
    Frightened:{summary:"Fear hinders you while its source is in sight.",description:"<p>While Frightened, your checks and attacks are hindered while you can see the source of your fear, and you cannot willingly move closer to it.</p>"},
    Grappled:{summary:"Your Speed is 0 while the grapple lasts.",description:"<p>While Grappled, your Speed is 0 and cannot be increased. The condition normally ends if the grappler can no longer hold you or you are moved beyond its reach.</p>"},
    Incapacitated:{summary:"You cannot take Actions, Bonus Actions, or Reactions.",description:"<p>While Incapacitated, you cannot take Actions, Bonus Actions, or Reactions. The condition also ends Concentration.</p>",endsConcentration:true},
    Invisible:{summary:"You cannot be seen without special senses or magic.",description:"<p>While Invisible, you cannot be seen unless an effect or special sense reveals you. Noise, tracks, and other clues can still reveal your position.</p>"},
    Paralyzed:{summary:"You are Incapacitated and largely unable to move or act.",description:"<p>Paralyzed includes being Incapacitated and severely restricts movement and speech. Attacks against you become much more dangerous, especially at close range.</p>",endsConcentration:true},
    Petrified:{summary:"You are transformed into an inert solid form.",description:"<p>While Petrified, you are transformed into a solid substance, are Incapacitated, and are largely unaware of your surroundings.</p>",endsConcentration:true},
    Poisoned:{summary:"Poison interferes with your attacks and ability checks.",description:"<p>While Poisoned, you have Disadvantage on attack rolls and ability checks.</p>"},
    Prone:{summary:"You are on the ground until you stand up.",description:"<p>While Prone, your movement is restricted, your own attacks are hindered, and attacks against you are affected by the attacker's distance. Standing normally costs half your Speed.</p>"},
    Restrained:{summary:"Your Speed is 0; attacks and Dexterity saves are impaired.",description:"<p>While Restrained, your Speed is 0. Your attacks are hindered, attacks against you are easier, and Dexterity saving throws are harder.</p>"},
    Stunned:{summary:"You are Incapacitated and unable to act normally.",description:"<p>While Stunned, you are Incapacitated and have major defensive penalties. The condition also ends Concentration.</p>",endsConcentration:true},
    Unconscious:{summary:"You are Incapacitated, unaware, and unable to act.",description:"<p>While Unconscious, you are Incapacitated, unaware of your surroundings, and unable to act normally. The condition ends Concentration.</p>",endsConcentration:true}
  };

  const SPELL_TEMPLATES={
    "shield":{summary:"+5 AC until the start of your next turn.",description:"<p>A magical barrier gives you a +5 bonus to AC until the start of your next turn, including against the triggering attack.</p>",duration:"start_next_turn",acBonus:5,selfMode:"auto"},
    "absorb elements":{summary:"Resistance to the triggering elemental damage until the start of your next turn; your next melee hit can deal extra elemental damage.",description:"<p>You gain resistance to the triggering acid, cold, fire, lightning, or thunder damage until the start of your next turn. The spell can also empower your next melee hit before then.</p>",duration:"start_next_turn",selfMode:"auto"},
    "mirror image":{summary:"Three illusory duplicates protect you. Track how many remain.",description:"<p>Three illusory duplicates of you appear and can cause attacks to hit a duplicate instead. Reduce the duplicate counter as they are destroyed.</p>",duration:"rounds",rounds:10,counterCurrent:3,counterMax:3,counterLabel:"Duplicates",selfMode:"auto"},
    "blur":{summary:"Your outline blurs, making you harder to hit while you maintain Concentration.",description:"<p>Your body becomes visually blurred while you maintain Concentration, making you harder to hit for creatures that rely on sight.</p>",duration:"concentration",selfMode:"auto"},
    "expeditious retreat":{summary:"You can Dash as a Bonus Action while you maintain Concentration.",description:"<p>While you maintain Concentration, the spell lets you Dash as a Bonus Action.</p>",duration:"concentration",selfMode:"auto"},
    "haste":{summary:"If you targeted yourself: +2 AC, faster movement, improved Dexterity saves, and an additional limited Action.",description:"<p>If you are the target, Haste improves your defenses and mobility and grants an additional limited Action while Concentration lasts.</p>",duration:"concentration",selfMode:"prompt"},
    "heroism":{summary:"If you targeted yourself: immune to Frightened and gain temporary HP at the start of each turn.",description:"<p>If you are the target, Heroism protects you from being Frightened and repeatedly grants temporary Hit Points while you maintain Concentration.</p>",duration:"concentration",selfMode:"prompt"},
    "bless":{summary:"If you targeted yourself: add 1d4 to attack rolls and saving throws.",description:"<p>If you are one of the targets, Bless adds 1d4 to your attack rolls and saving throws while Concentration lasts.</p>",duration:"concentration",selfMode:"prompt"},
    "invisibility":{summary:"If you targeted yourself: you have the Invisible condition while Concentration lasts.",description:"<p>If you are the target, you have the Invisible condition until the spell ends.</p>",duration:"concentration",selfMode:"prompt",condition:"Invisible"},
    "greater invisibility":{summary:"If you targeted yourself: you have the Invisible condition while Concentration lasts.",description:"<p>If you are the target, you remain Invisible while the spell lasts, including while attacking or casting spells.</p>",duration:"concentration",selfMode:"prompt",condition:"Invisible"},
    "shield of faith":{summary:"If you targeted yourself: +2 AC while Concentration lasts.",description:"<p>If you are the target, a protective magical field grants +2 AC while Concentration lasts.</p>",duration:"concentration",acBonus:2,selfMode:"prompt"},
    "fly":{summary:"If you targeted yourself: you gain the spell's flying movement while Concentration lasts.",description:"<p>If you are the target, you gain a Fly Speed for the duration while Concentration is maintained.</p>",duration:"concentration",selfMode:"prompt"},
    "spider climb":{summary:"If you targeted yourself: move along walls and ceilings while Concentration lasts.",description:"<p>If you are the target, you can move across vertical surfaces and ceilings while Concentration lasts.</p>",duration:"concentration",selfMode:"prompt"},
    "longstrider":{summary:"If you targeted yourself: your Speed is increased for 1 hour.",description:"<p>If you are the target, your Speed increases for the spell's duration.</p>",duration:"manual",selfMode:"prompt"},
    "jump":{summary:"If you targeted yourself: your jumping ability is magically enhanced.",description:"<p>If you are the target, the spell greatly improves your jumping capability for its duration.</p>",duration:"rounds",rounds:10,selfMode:"prompt"}
  };

  function uid(){ return (typeof crypto!=="undefined"&&crypto.randomUUID)?crypto.randomUUID():"eff-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2); }
  function num(v,f=0){ const n=Number(v); return Number.isFinite(n)?n:f; }
  function normalizeEffect(raw={}){
    const kind=raw.kind==="condition"?"condition":"effect";
    const name=String(raw.name||raw.conditionName||"Effect");
    const counterMax=raw.counterMax==null?null:Math.max(1,num(raw.counterMax,1));
    let counterCurrent=raw.counterCurrent==null?null:Math.max(0,num(raw.counterCurrent,0));
    if(counterMax!=null&&counterCurrent!=null) counterCurrent=Math.min(counterMax,counterCurrent);
    return {id:raw.id||uid(),kind,name,conditionName:kind==="condition"?String(raw.conditionName||name):"",source:String(raw.source||""),summary:String(raw.summary||""),description:String(raw.description||""),duration:["manual","concentration","start_next_turn","rounds","short_rest","long_rest","permanent"].includes(raw.duration)?raw.duration:"manual",remainingRounds:raw.remainingRounds==null?null:Math.max(0,num(raw.remainingRounds,0)),counterCurrent,counterMax,counterLabel:String(raw.counterLabel||""),acBonus:num(raw.acBonus,0),concentration:!!raw.concentration||raw.duration==="concentration",linkedSpellId:String(raw.linkedSpellId||""),parentEffectId:String(raw.parentEffectId||""),createdTurnKey:String(raw.createdTurnKey||""),lastTickTurnKey:String(raw.lastTickTurnKey||""),startedAt:raw.startedAt||new Date().toISOString(),custom:!!raw.custom};
  }
  function ensure(c){ if(!c||typeof c!=="object") return []; if(!Array.isArray(c.activeEffects)) c.activeEffects=[]; c.activeEffects=c.activeEffects.map(normalizeEffect); return c.activeEffects; }
  function getConditions(c){ return ensure(c).filter(x=>x.kind==="condition"); }
  function getEffects(c){ return ensure(c).filter(x=>x.kind!=="condition"); }
  function getConcentration(c){ return getEffects(c).find(x=>x.concentration||x.duration==="concentration")||null; }
  function getCondition(c,name){ return getConditions(c).find(x=>x.conditionName===name)||null; }
  function removeById(c,id){ const list=ensure(c),ids=new Set([id]); let changed=true; while(changed){changed=false;for(const e of list){if(e.parentEffectId&&ids.has(e.parentEffectId)&&!ids.has(e.id)){ids.add(e.id);changed=true;}}} c.activeEffects=list.filter(x=>!ids.has(x.id)); return ids.size; }
  function clearConcentration(c){ const ids=getEffects(c).filter(x=>x.concentration||x.duration==="concentration").map(x=>x.id); ids.forEach(id=>removeById(c,id)); return ids.length; }
  function add(c,raw){ const list=ensure(c),e=normalizeEffect(raw); list.push(e); c.activeEffects=list; return e; }
  function setCondition(c,name,enabled=true,opts={}){
    const def=CONDITION_DEFS[name]; if(!def) return null; let e=getCondition(c,name);
    if(enabled){ if(e){ if(name==="Exhaustion"&&opts.level!=null)e.counterCurrent=Math.max(1,Math.min(6,num(opts.level,1))); return e; }
      e=add(c,{kind:"condition",name,conditionName:name,source:opts.source||"Condition",summary:def.summary,description:def.description,duration:opts.duration||"manual",counterCurrent:def.counter?Math.max(1,Math.min(def.counterMax,num(opts.level,1))):null,counterMax:def.counter?def.counterMax:null,counterLabel:def.counter?"Level":"",parentEffectId:opts.parentEffectId||""});
      if(def.endsConcentration) clearConcentration(c); return e;
    }
    if(e) removeById(c,e.id); return null;
  }
  function spellTemplate(spell){ return spell?SPELL_TEMPLATES[String(spell.name||"").trim().toLowerCase()]||null:null; }
  function triggerSpell(c,spell,opts={}){
    ensure(c); const t=spellTemplate(spell),conc=!!spell?.concentration,applySelf=opts.applySelf!==false,turn=opts.createdTurnKey||""; let e=null;
    if(conc){ clearConcentration(c); const rich=t&&(t.selfMode==="auto"||(t.selfMode==="prompt"&&applySelf)); e=add(c,{name:spell.name||"Concentration",source:opts.source||spell.source||"Spell",summary:rich?t.summary:`Concentrating on ${spell.name||"this spell"}.`,description:rich?t.description:`<p>You are concentrating on ${String(spell.name||"this spell")}.</p>`,duration:"concentration",concentration:true,linkedSpellId:opts.spellId||spell.id||"",acBonus:rich?num(t.acBonus,0):0,createdTurnKey:turn}); if(rich&&t.condition)setCondition(c,t.condition,true,{source:spell.name||"Spell",parentEffectId:e.id}); return {effect:e,template:t,concentration:true}; }
    if(t&&(t.selfMode==="auto"||(t.selfMode==="prompt"&&applySelf))){ const key=String(opts.spellId||spell.id||""); for(const old of [...getEffects(c)]) if((key&&old.linkedSpellId===key)||(!key&&old.name===spell.name)) removeById(c,old.id); e=add(c,{name:spell.name||"Spell effect",source:opts.source||spell.source||"Spell",summary:t.summary,description:t.description,duration:t.duration||"manual",remainingRounds:t.rounds||null,counterCurrent:t.counterCurrent??null,counterMax:t.counterMax??null,counterLabel:t.counterLabel||"",acBonus:num(t.acBonus,0),linkedSpellId:key,createdTurnKey:turn}); if(t.condition)setCondition(c,t.condition,true,{source:spell.name||"Spell",parentEffectId:e.id}); }
    return {effect:e,template:t,concentration:false};
  }
  function durationLabel(e){ e=normalizeEffect(e); if(e.duration==="concentration")return"Concentration"; if(e.duration==="start_next_turn")return"Until start of your next turn"; if(e.duration==="rounds")return`${Math.max(0,e.remainingRounds||0)} round${Number(e.remainingRounds)===1?"":"s"} remaining`; if(e.duration==="short_rest")return"Until Short Rest"; if(e.duration==="long_rest")return"Until Long Rest"; if(e.duration==="permanent")return"Persistent"; return"Until removed"; }
  function totalAcBonus(c){ return getEffects(c).reduce((n,e)=>n+num(e.acBonus,0),0); }
  function processOwnerTurnStart(c,turnKey){ const expired=[]; for(const e of [...ensure(c)]){ if(e.kind==="condition")continue; if(e.duration==="start_next_turn"){if(e.createdTurnKey!==turnKey)expired.push(e.id);} else if(e.duration==="rounds"){if(e.lastTickTurnKey===turnKey)continue;if(e.createdTurnKey&&e.createdTurnKey===turnKey){e.lastTickTurnKey=turnKey;continue;}e.remainingRounds=Math.max(0,num(e.remainingRounds,0)-1);e.lastTickTurnKey=turnKey;if(e.remainingRounds<=0)expired.push(e.id);}} expired.forEach(id=>removeById(c,id)); return expired; }
  function applyRest(c,kind){ const ids=[]; for(const e of ensure(c)){ if(e.kind==="condition")continue; if(kind==="short"&&["start_next_turn","rounds","short_rest"].includes(e.duration))ids.push(e.id); if(kind==="long"&&(["start_next_turn","rounds","short_rest","long_rest","concentration"].includes(e.duration)||e.concentration))ids.push(e.id);} ids.forEach(id=>removeById(c,id)); return ids.length; }
  root.DND_EFFECTS={CONDITION_DEFS,SPELL_TEMPLATES,normalizeEffect,ensure,getConditions,getEffects,getConcentration,getCondition,add,removeById,clearConcentration,setCondition,spellTemplate,triggerSpell,durationLabel,totalAcBonus,processOwnerTurnStart,applyRest};
})(typeof window!=="undefined"?window:this);
