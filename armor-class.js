(function(root){
  "use strict";

  const ARMOR_RULES={
    PADDED:{base:11,dex:"full",label:"Padded"},
    LEATHER:{base:11,dex:"full",label:"Leather"},
    STUDDED_LEATHER:{base:12,dex:"full",label:"Studded Leather"},
    HIDE_ARMOR:{base:12,dex:"max2",label:"Hide"},
    CHAIN_SHIRT:{base:13,dex:"max2",label:"Chain Shirt"},
    SCALE_MAIL:{base:14,dex:"max2",label:"Scale Mail"},
    BREASTPLATE:{base:14,dex:"max2",label:"Breastplate"},
    HALF_PLATE:{base:15,dex:"max2",label:"Half Plate"},
    SPIKED_ARMOR:{base:14,dex:"max2",label:"Spiked Armor"},
    RING_MAIL:{base:14,dex:"none",label:"Ring Mail"},
    CHAIN_MAIL:{base:16,dex:"none",label:"Chain Mail"},
    SPLINT:{base:17,dex:"none",label:"Splint"},
    PLATE:{base:18,dex:"none",label:"Plate"}
  };

  function abilityMod(score){
    const n=Number(score);
    return Number.isFinite(n)?Math.floor((n-10)/2):0;
  }
  function stripHtml(value=""){
    return String(value||"").replace(/<[^>]*>/g," ").replace(/&nbsp;/gi," ").replace(/\s+/g," ").trim();
  }
  function isShieldDef(def){
    if(!def) return false;
    return /shield/i.test(String(def.baseRequirement||"")) || String(def.itemType||"").toLowerCase()==="shield" || /(?:^|_)SHIELD(?:_|$)/i.test(String(def.id||""));
  }
  function armorRuleForDef(def){
    const id=String(def?.id||"").toUpperCase();
    for(const [key,rule] of Object.entries(ARMOR_RULES)){
      if(id.endsWith("_"+key) || id.includes("ARMOR_"+key)) return rule;
    }
    return null;
  }
  function armorValue(rule,dexMod){
    if(!rule) return null;
    if(rule.dex==="full") return rule.base+dexMod;
    if(rule.dex==="max2") return rule.base+Math.min(2,dexMod);
    return rule.base;
  }
  function directAcBonusFromDef(def){
    if(!def) return 0;
    const text=stripHtml(def.description).toLowerCase();
    if(!text) return 0;
    // Conditional formula items are not safe to apply as a flat bonus.
    if(/no armor|not wearing armor|aren't wearing armor|isn't wearing armor|without armor/.test(text)) return 0;
    const matches=[...text.matchAll(/\+\s*(\d+)\s+(?:bonus\s+)?to\s+(?:your\s+)?(?:armor class|ac)\b/g)];
    if(matches.length) return Math.max(...matches.map(m=>Number(m[1])||0));
    const matches2=[...text.matchAll(/(?:gain|have|grants? you)\s+(?:a\s+)?\+\s*(\d+)\s+bonus\s+to\s+(?:your\s+)?(?:armor class|ac)\b/g)];
    if(matches2.length) return Math.max(...matches2.map(m=>Number(m[1])||0));
    return 0;
  }
  function hasId(activeIds,pattern){ return (activeIds||[]).some(id=>pattern.test(String(id||""))); }

  function calculate(character,itemDefs={},effectsApi=null){
    const a=character?.aurora;
    if(!a) return {available:false,total:null,staticAc:null,effectBonus:0,breakdown:[],warnings:["Import an Aurora character to calculate Armor Class."]};

    const abilities=a.abilities||{};
    const dex=abilityMod(abilities.dexterity);
    const con=abilityMod(abilities.constitution);
    const wis=abilityMod(abilities.wisdom);
    const equipment=(a.equipment||[]).filter(x=>x&&x.equipped);
    const activeIds=a.activeIds||[];
    const breakdown=[];
    const warnings=[];

    const bodyArmors=[];
    const shields=[];
    for(const item of equipment){
      const def=itemDefs[item.id];
      if(!def || def.elementType!=="Armor") continue;
      if(isShieldDef(def)) shields.push({item,def});
      else {
        const rule=armorRuleForDef(def);
        if(rule) bodyArmors.push({item,def,rule,value:armorValue(rule,dex)});
      }
    }

    let baseAc=10+dex;
    let baseLabel=`Unarmored 10 ${dex>=0?"+":"−"} DEX ${Math.abs(dex)}`;
    let wearingArmor=false;

    if(bodyArmors.length){
      bodyArmors.sort((x,y)=>y.value-x.value);
      const chosen=bodyArmors[0];
      baseAc=chosen.value;
      baseLabel=chosen.rule.label;
      wearingArmor=true;
      if(bodyArmors.length>1) warnings.push("More than one suit of armor is marked equipped; the highest valid base AC is being used.");
    }else{
      const candidates=[{value:10+dex,label:`Unarmored 10 ${dex>=0?"+":"−"} DEX ${Math.abs(dex)}`}];
      if(hasId(activeIds,/BARBARIAN.*UNARMORED.*DEFEN[CS]E/i)) candidates.push({value:10+dex+con,label:"Barbarian Unarmored Defense"});
      if(!shields.length && hasId(activeIds,/MONK.*UNARMORED.*DEFEN[CS]E/i)) candidates.push({value:10+dex+wis,label:"Monk Unarmored Defense"});
      candidates.sort((x,y)=>y.value-x.value);
      baseAc=candidates[0].value;
      baseLabel=candidates[0].label;
    }
    breakdown.push({label:baseLabel,value:baseAc,kind:"base"});

    let shieldBonus=0;
    if(shields.length){
      shieldBonus=2;
      breakdown.push({label:"Shield",value:2,kind:"equipment"});
      if(shields.length>1) warnings.push("More than one shield is marked equipped; only one normal +2 shield bonus is applied.");
    }

    let itemBonus=0;
    for(const item of equipment){
      const baseDef=itemDefs[item.id];
      // Standalone magic items can provide direct flat AC bonuses. Mundane armor
      // bases are handled above and therefore are not parsed here.
      if(baseDef && baseDef.elementType!=="Armor"){
        const bonus=directAcBonusFromDef(baseDef);
        if(bonus){ itemBonus+=bonus; breakdown.push({label:baseDef.name||item.name||"Item",value:bonus,kind:"magic"}); }
      }
      for(const ad of (item.adorners||[])){
        const def=itemDefs[ad.id];
        const bonus=directAcBonusFromDef(def);
        if(bonus){ itemBonus+=bonus; breakdown.push({label:def?.name||ad.name||"Magic item",value:bonus,kind:"magic"}); }
      }
    }

    let featureBonus=0;
    if(wearingArmor && hasId(activeIds,/FIGHTING_STYLE.*DEFEN[CS]E/i)){
      featureBonus+=1; breakdown.push({label:"Defense Fighting Style",value:1,kind:"feature"});
    }
    if(hasId(activeIds,/WARFORGED.*INTEGRATED_PROTECTION/i)){
      featureBonus+=1; breakdown.push({label:"Integrated Protection",value:1,kind:"feature"});
    }

    let effectBonus=0;
    if(effectsApi?.totalAcBonus) effectBonus=Number(effectsApi.totalAcBonus(character))||0;
    else effectBonus=(character.activeEffects||[]).reduce((n,e)=>n+(Number(e?.acBonus)||0),0);
    if(effectBonus) breakdown.push({label:"Active effects",value:effectBonus,kind:"effect"});

    const staticAc=baseAc+shieldBonus+itemBonus+featureBonus;
    return {
      available:true,
      total:staticAc+effectBonus,
      staticAc,
      effectBonus,
      baseAc,
      shieldBonus,
      itemBonus,
      featureBonus,
      breakdown,
      warnings
    };
  }

  root.DND_ARMOR_CLASS={ARMOR_RULES,abilityMod,isShieldDef,armorRuleForDef,directAcBonusFromDef,calculate};
})(typeof window!=="undefined"?window:this);
