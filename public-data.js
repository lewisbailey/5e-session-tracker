// Public web edition compatibility layer.
// Full Aurora-derived book databases are intentionally not distributed.
window.PUBLIC_EDITION=true;
// Small SRD-compatible mechanical lookup tables used to calculate imported
// characters' HP and AC. These contain no book descriptions or flavour text.
window.AURORA_CLASS_HD={
  "ID_WOTC_PHB24_CLASS_BARBARIAN":12,"ID_WOTC_PHB24_CLASS_BARD":8,
  "ID_WOTC_PHB24_CLASS_CLERIC":8,"ID_WOTC_PHB24_CLASS_DRUID":8,
  "ID_WOTC_PHB24_CLASS_FIGHTER":10,"ID_WOTC_PHB24_CLASS_MONK":8,
  "ID_WOTC_PHB24_CLASS_PALADIN":10,"ID_WOTC_PHB24_CLASS_RANGER":10,
  "ID_WOTC_PHB24_CLASS_ROGUE":8,"ID_WOTC_PHB24_CLASS_SORCERER":6,
  "ID_WOTC_PHB24_CLASS_WARLOCK":8,"ID_WOTC_PHB24_CLASS_WIZARD":6,
  "ID_WOTC_PHB_CLASS_BARBARIAN":12,"ID_WOTC_PHB_CLASS_BARD":8,
  "ID_WOTC_PHB_CLASS_CLERIC":8,"ID_WOTC_PHB_CLASS_DRUID":8,
  "ID_WOTC_PHB_CLASS_FIGHTER":10,"ID_WOTC_PHB_CLASS_MONK":8,
  "ID_WOTC_PHB_CLASS_PALADIN":10,"ID_WOTC_PHB_CLASS_RANGER":10,
  "ID_WOTC_PHB_CLASS_ROGUE":8,"ID_WOTC_PHB_CLASS_SORCERER":6,
  "ID_WOTC_PHB_CLASS_WARLOCK":8,"ID_WOTC_PHB_CLASS_WIZARD":6
};
window.AURORA_SPELLS={};
window.AURORA_RESOURCE_DEFS={};
window.AURORA_FREE_CASTS={};
const PUBLIC_ARMOR_IDS=[
  "PADDED","LEATHER","STUDDED_LEATHER","HIDE_ARMOR","CHAIN_SHIRT",
  "SCALE_MAIL","BREASTPLATE","HALF_PLATE","RING_MAIL","CHAIN_MAIL",
  "SPLINT","PLATE","SHIELD"
];
window.AURORA_ITEMS={};
for(const edition of ["PHB","PHB24"]){
  for(const armor of PUBLIC_ARMOR_IDS){
    const group=armor==="SHIELD"?"SHIELD":(["PADDED","LEATHER","STUDDED_LEATHER"].includes(armor)?"LIGHT":(["HIDE_ARMOR","CHAIN_SHIRT","SCALE_MAIL","BREASTPLATE","HALF_PLATE"].includes(armor)?"MEDIUM":"HEAVY"));
    const id=`ID_WOTC_${edition}_ARMOR_${group}_${armor}`;
    window.AURORA_ITEMS[id]={id,name:armor.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase()),elementType:"Armor",itemType:armor==="SHIELD"?"Shield":"Armor",description:""};
  }
}
window.AURORA_COMPANIONS={};
window.AURORA_FAMILIAR_IDS=[];
window.AURORA_CHAIN_FAMILIAR_IDS=[];
window.AURORA_CLASS_COMPANIONS={};
