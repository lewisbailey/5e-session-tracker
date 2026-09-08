(function(global){
  "use strict";

  const PACT_MAGIC_GRANT="ID_INTERNAL_GRANTS_PACT_MAGIC_FEATURE";
  const SPELLCASTING_GRANT="ID_INTERNAL_GRANTS_SPELLCASTING_FEATURE";

  function clamp(n,min,max){ return Math.min(max,Math.max(min,n)); }

  function classLevel(character,needle){
    const target=String(needle||"").toLowerCase();
    let total=0;
    for(const c of character?.aurora?.classLevels||[]){
      const id=String(c.classId||"").toLowerCase();
      if(id.includes(target)) total+=Math.max(0,Number(c.levels)||0);
    }
    return total;
  }

  function pactSlotLevel(warlockLevel){
    const lvl=Math.max(0,Number(warlockLevel)||0);
    if(lvl>=9) return 5;
    if(lvl>=7) return 4;
    if(lvl>=5) return 3;
    if(lvl>=3) return 2;
    if(lvl>=1) return 1;
    return 0;
  }

  function pactSlotCount(warlockLevel){
    const lvl=Math.max(0,Number(warlockLevel)||0);
    if(lvl>=17) return 4;
    if(lvl>=11) return 3;
    if(lvl>=2) return 2;
    if(lvl>=1) return 1;
    return 0;
  }

  function getPactMagicInfo(character){
    const aurora=character?.aurora||{};
    const ids=new Set(Array.isArray(aurora.activeIds)?aurora.activeIds:[]);
    const wl=classLevel(character,"class_warlock");
    // The internal grant is the most reliable signal. Class-level fallback also
    // repairs older tracker saves imported before activeIds was retained.
    const active=ids.has(PACT_MAGIC_GRANT) || wl>0;
    const standardSpellcasting=ids.has(SPELLCASTING_GRANT);
    return {
      active,
      exclusive:active && !standardSpellcasting,
      mixed:active && standardSpellcasting,
      warlockLevel:wl,
      slotLevel:pactSlotLevel(wl),
      slotCount:pactSlotCount(wl)
    };
  }

  function restoreShortRestResources(character){
    for(const r of character?.resources||[]){
      const max=Math.max(1,Number(r.max)||1);
      if(r.reset==="short" || r.shortRestore==="full"){
        r.current=max;
      }else if(Number(r.shortRestore)>0){
        r.current=clamp((Number(r.current)||0)+Number(r.shortRestore),0,max);
      }
    }
  }

  function restoreLongRestResources(character){
    for(const r of character?.resources||[]){
      if(r.reset==="short" || r.reset==="long"){
        r.current=Math.max(1,Number(r.max)||1);
      }
    }
  }

  function applyShortRest(character){
    if(!character) return {pactMagicRestored:false,pactMagicMixed:false};
    restoreShortRestResources(character);

    // Pact Magic is distinct from normal Spellcasting. Aurora exposes a single
    // slot grid, which is unambiguous for a Warlock-only spell-slot pool.
    // For a caster multiclass, the combined grid cannot tell us which spent
    // slots were Pact slots, so we deliberately avoid restoring normal slots.
    const pact=getPactMagicInfo(character);
    let restored=false;
    if(pact.exclusive && pact.slotLevel>0){
      const slot=character.spellSlots?.[pact.slotLevel];
      if(slot){ slot.used=0; restored=true; }
    }
    return {pactMagicRestored:restored,pactMagicMixed:pact.mixed,pact};
  }

  function applyLongRest(character){
    if(!character) return;

    // 2024 Long Rest: regain all lost HP and all spent Hit Point Dice.
    if(character.hp){
      character.hp.current=Math.max(0,Number(character.hp.max)||0);
      character.hp.temp=0;
    }

    for(const s of Object.values(character.spellSlots||{})) s.used=0;
    restoreLongRestResources(character);

    if(character.death){
      character.death.success=0;
      character.death.failure=0;
    }

    for(const h of character.hitDice||[]) h.used=0;
  }

  global.DND_REST_RULES={
    PACT_MAGIC_GRANT,
    SPELLCASTING_GRANT,
    pactSlotLevel,
    pactSlotCount,
    getPactMagicInfo,
    applyShortRest,
    applyLongRest
  };
})(typeof window!=="undefined"?window:globalThis);
