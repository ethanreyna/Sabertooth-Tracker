// Searchable catalogue of Skyrim items for collection jobs. Not exhaustive (the
// game has thousands of records) but covers everything a guild realistically
// asks members to gather. Members can still type in a custom item name.

import type { ItemRecord } from './types';

export interface ItemDef {
  name: string;
  cat: string;
}

const g = (cat: string, names: string[]): ItemDef[] => names.map((name) => ({ name, cat }));

export const ITEMS: ItemDef[] = [
  ...g('Ore', [
    'Corundum Ore', 'Ebony Ore', 'Gold Ore', 'Iron Ore', 'Malachite Ore', 'Moonstone Ore',
    'Orichalcum Ore', 'Quicksilver Ore', 'Silver Ore', 'Stalhrim', 'Heartstone',
  ]),
  ...g('Ingot', [
    'Corundum Ingot', 'Dwarven Ingot', 'Ebony Ingot', 'Gold Ingot', 'Iron Ingot',
    'Malachite Ingot', 'Moonstone Ingot', 'Orichalcum Ingot', 'Quicksilver Ingot',
    'Silver Ingot', 'Steel Ingot',
  ]),
  ...g('Smithing', [
    'Charcoal', 'Corundum', 'Firewood', 'Leather', 'Leather Strips', 'Bone Meal',
    'Chaurus Chitin', 'Dwarven Metal Scraps', 'Dwarven Bowl', 'Dwarven Plate Metal',
    'Dwarven Cog', 'Dwarven Gear', 'Dwarven Gyro', 'Dwarven Strut',
    'Nail', 'Hinge', 'Lock', 'Straw', 'Clay', 'Quarried Stone', 'Glass',
  ]),
  ...g('Gem', [
    'Amethyst', 'Diamond', 'Emerald', 'Garnet', 'Ruby', 'Sapphire',
    'Flawless Amethyst', 'Flawless Diamond', 'Flawless Emerald', 'Flawless Garnet',
    'Flawless Ruby', 'Flawless Sapphire', 'Geode', 'Gold Ring', 'Gold Necklace',
    'Silver Ring', 'Silver Necklace', 'Gold Jewelled Necklace', 'Silver Jewelled Necklace',
  ]),
  ...g('Soul Gem', [
    'Petty Soul Gem', 'Lesser Soul Gem', 'Common Soul Gem', 'Greater Soul Gem',
    'Grand Soul Gem', 'Black Soul Gem', 'Azura’s Star', 'The Black Star',
  ]),
  ...g('Ingredient', [
    'Blue Mountain Flower', 'Red Mountain Flower', 'Purple Mountain Flower',
    'Yellow Mountain Flower', 'Blue Butterfly Wing', 'Monarch Butterfly Wing',
    'Luna Moth Wing', 'Torchbug Thorax', 'Bee', 'Beehive Husk', 'Honeycomb',
    'Deathbell', 'Nightshade', 'Nirnroot', 'Crimson Nirnroot', 'Lavender',
    'Thistle Branch', 'Tundra Cotton', 'Dragon’s Tongue', 'Snowberries',
    'Juniper Berries', 'Elves Ear', 'Canis Root', 'Imp Stool', 'Bleeding Crown',
    'Namira’s Rot', 'White Cap', 'Fly Amanita', 'Scaly Pholiota', 'Glowing Mushroom',
    'Creep Cluster', 'Swamp Fungal Pod', 'Giant Lichen', 'Mora Tapinella',
    'Frost Mirriam', 'Garlic', 'Ash Creep Cluster', 'Ash Hopper Jelly',
    'Emperor Parasol Moss', 'Felsaad Tern Feathers', 'Netch Jelly', 'Trama Root',
    'Scathecraw', 'Spawn Ash', 'Gleamblossom', 'Jarrin Root',
  ]),
  ...g('Animal Part', [
    'Bear Claws', 'Cave Bear Pelt', 'Snow Bear Pelt', 'Bear Pelt', 'Wolf Pelt',
    'Ice Wolf Pelt', 'Sabre Cat Pelt', 'Sabre Cat Tooth', 'Sabre Cat Eye',
    'Snow Sabre Cat Pelt', 'Fox Pelt', 'Snow Fox Pelt', 'Goat Hide', 'Goat Horns',
    'Cow Hide', 'Deer Hide', 'Deer Antlers', 'Elk Hide', 'Horse Hide', 'Horker Tusk',
    'Horker Meat', 'Mammoth Tusk', 'Mammoth Snout', 'Giant’s Toe', 'Troll Fat',
    'Hagraven Feathers', 'Hagraven Claw', 'Falmer Ear', 'Chaurus Eggs', 'Frostbite Venom',
    'Spider Egg', 'Slaughterfish Egg', 'Slaughterfish Scales', 'Skeever Tail',
    'Hawk Feathers', 'Hawk Beak', 'Rock Warbler Egg', 'Chicken’s Egg',
    'Pine Thrush Egg', 'Charred Skeever Hide', 'Small Antlers', 'Small Pearl', 'Pearl',
    'Nordic Barnacle', 'Abecean Longfin', 'Cyrodilic Spadetail', 'Histcarp',
    'Silverside Perch', 'Salmon Roe', 'Vampire Dust', 'Void Salts', 'Fire Salts',
    'Frost Salts', 'Daedra Heart', 'Human Heart', 'Human Flesh', 'Briar Heart',
    'Dragon Bone', 'Dragon Scales', 'Ectoplasm', 'Taproot', 'Wisp Wrappings',
  ]),
  ...g('Food', [
    'Apple', 'Green Apple', 'Cabbage', 'Carrot', 'Gourd', 'Leek', 'Potato', 'Tomato',
    'Bread', 'Sweet Roll', 'Apple Pie', 'Boiled Creme Treat', 'Long Taffy Treat',
    'Cheese Wedge', 'Cheese Wheel', 'Eidar Cheese Wheel', 'Goat Cheese Wheel',
    'Beef Stew', 'Vegetable Soup', 'Venison Stew', 'Horker Stew', 'Cabbage Soup',
    'Elsweyr Fondue', 'Grilled Leeks', 'Baked Potatoes', 'Salmon Steak', 'Cooked Beef',
    'Chicken Breast', 'Pheasant Breast', 'Rabbit Haunch', 'Venison', 'Beef',
    'Horse Haunch', 'Mammoth Steak', 'Clam Meat', 'Wheat', 'Ale', 'Nord Mead',
    'Black-Briar Mead', 'Honningbrew Mead', 'Wine', 'Alto Wine', 'Spiced Wine',
    'Firebrand Wine', 'Colovian Brandy', 'Sujamma', 'Flin', 'Water', 'Salt Pile',
  ]),
  ...g('Weapon', [
    'Iron Sword', 'Steel Sword', 'Orcish Sword', 'Dwarven Sword', 'Elven Sword',
    'Glass Sword', 'Ebony Sword', 'Daedric Sword', 'Nordic Sword', 'Stalhrim Sword',
    'Iron Dagger', 'Steel Dagger', 'Elven Dagger', 'Glass Dagger', 'Ebony Dagger',
    'Iron War Axe', 'Steel War Axe', 'Orcish War Axe', 'Elven War Axe',
    'Iron Battleaxe', 'Steel Battleaxe', 'Orcish Battleaxe', 'Ebony Battleaxe',
    'Iron Greatsword', 'Steel Greatsword', 'Elven Greatsword', 'Daedric Greatsword',
    'Iron Mace', 'Steel Mace', 'Dwarven Mace', 'Ebony Mace',
    'Iron Warhammer', 'Steel Warhammer', 'Dwarven Warhammer', 'Daedric Warhammer',
    'Hunting Bow', 'Long Bow', 'Imperial Bow', 'Orcish Bow', 'Dwarven Bow',
    'Elven Bow', 'Glass Bow', 'Ebony Bow', 'Daedric Bow', 'Nordic Bow',
    'Dwarven Crossbow', 'Crossbow', 'Iron Arrow', 'Steel Arrow', 'Orcish Arrow',
    'Dwarven Arrow', 'Elven Arrow', 'Glass Arrow', 'Ebony Arrow', 'Daedric Arrow',
    'Nordic Arrow', 'Stalhrim Arrow', 'Falmer Arrow', 'Forsworn Arrow', 'Steel Bolt',
  ]),
  ...g('Armor', [
    'Iron Helmet', 'Iron Armor', 'Iron Gauntlets', 'Iron Boots', 'Iron Shield',
    'Steel Helmet', 'Steel Armor', 'Steel Gauntlets', 'Steel Boots', 'Steel Shield',
    'Steel Plate Armor', 'Dwarven Armor', 'Dwarven Helmet', 'Dwarven Shield',
    'Orcish Armor', 'Orcish Helmet', 'Elven Armor', 'Elven Helmet', 'Elven Shield',
    'Glass Armor', 'Glass Helmet', 'Glass Shield', 'Ebony Armor', 'Ebony Helmet',
    'Ebony Shield', 'Daedric Armor', 'Daedric Helmet', 'Daedric Shield',
    'Leather Armor', 'Leather Helmet', 'Leather Bracers', 'Leather Boots',
    'Hide Armor', 'Studded Armor', 'Scaled Armor', 'Fur Armor',
    'Nordic Carved Armor', 'Stalhrim Armor', 'Chitin Armor', 'Bonemold Armor',
    'Imperial Armor', 'Stormcloak Cuirass', 'Guard’s Armor', 'Banded Iron Shield',
  ]),
  ...g('Clothing', [
    'Clothes', 'Fine Clothes', 'Merchant Clothes', 'Farm Clothes', 'Mage Robes',
    'Novice Robes', 'Apprentice Robes', 'Adept Robes', 'Expert Robes', 'Master Robes',
    'Hooded Robes', 'Monk Robes', 'Boots', 'Shoes', 'Fine Boots', 'Hat', 'Hood',
    'Circlet', 'Amulet of Talos', 'Amulet of Mara', 'Amulet of Akatosh',
    'Amulet of Dibella', 'Amulet of Kynareth', 'Amulet of Stendarr',
    'Amulet of Julianos', 'Amulet of Zenithar', 'Amulet of Arkay',
  ]),
  ...g('Potion', [
    'Potion of Healing', 'Potion of Minor Healing', 'Potion of Plentiful Healing',
    'Potion of Vigorous Healing', 'Potion of Extreme Healing', 'Potion of Ultimate Healing',
    'Potion of Magicka', 'Potion of Plentiful Magicka', 'Potion of Extreme Magicka',
    'Potion of Stamina', 'Potion of Plentiful Stamina', 'Potion of Extreme Stamina',
    'Potion of Cure Disease', 'Potion of Resist Fire', 'Potion of Resist Frost',
    'Potion of Resist Shock', 'Potion of Invisibility', 'Potion of Waterbreathing',
    'Potion of Strength', 'Potion of True Shot', 'Deadly Poison', 'Lingering Poison',
    'Paralysis Poison', 'Frenzy Poison', 'Damage Health Poison', 'Skooma',
  ]),
  ...g('Scroll & Book', [
    'Scroll of Fireball', 'Scroll of Firebolt', 'Scroll of Ice Storm',
    'Scroll of Lightning Bolt', 'Scroll of Healing Hands', 'Scroll of Fast Healing',
    'Scroll of Blizzard', 'Scroll of Fire Storm', 'Scroll of Dread Zombie',
    'Elder Scroll', 'Spell Tome', 'Black Book', 'Dragon Priest Mask', 'Skill Book',
    'Journal', 'Note', 'Treasure Map', 'Ruined Book',
  ]),
  ...g('Valuable', [
    'Gold', 'Gold Candlestick', 'Silver Candlestick', 'Gold Goblet', 'Silver Goblet',
    'Gold Plate', 'Silver Plate', 'Gold Urn', 'Silver Urn', 'Dwarven Puzzle Cube',
    'Golden Claw', 'Ivory Claw', 'Ebony Claw', 'Diamond Claw', 'Emerald Claw',
    'Glass Claw', 'Ruby Claw', 'Sapphire Claw', 'Painting', 'Statue',
  ]),
  ...g('Misc', [
    'Lockpick', 'Torch', 'Empty Wine Bottle', 'Bucket', 'Broom', 'Pickaxe',
    'Woodcutter’s Axe', 'Shovel', 'Fishing Rod', 'Hammer', 'Tongs',
    'Random Bones', 'Skull', 'Linen Wrap', 'Burial Urn', 'Soul Husk', 'Daedra Silk',
    'Staff of Magnus', 'Key', 'Sack of Flour', 'Riekling Spear',
  ]),
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();

/**
 * The list every picker searches: the built-in records above plus whatever the
 * guild has added to its own item database. A custom entry with the same name
 * as a built-in wins, so a guild can correct a category without us editing the
 * catalogue.
 */
export function catalogue(custom: ItemRecord[]): ItemDef[] {
  const byName = new Map<string, ItemDef>();
  for (const it of ITEMS) byName.set(norm(it.name), it);
  for (const c of custom) {
    const name = c.name.trim();
    if (!name) continue;
    byName.set(norm(name), { name, cat: c.category.trim() || 'Custom' });
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Substring search over a catalogue, prefix matches ranked first. */
export function searchItems(q: string, limit = 40, list: ItemDef[] = ITEMS): ItemDef[] {
  const n = norm(q);
  if (!n) return list.slice(0, limit);
  const starts: ItemDef[] = [];
  const contains: ItemDef[] = [];
  for (const it of list) {
    const nn = norm(it.name);
    if (nn.startsWith(n)) starts.push(it);
    else if (nn.includes(n)) contains.push(it);
  }
  return [...starts, ...contains].slice(0, limit);
}

/** True when the name is already in `list`, however it was capitalised. */
export const inCatalogue = (list: ItemDef[], name: string): boolean =>
  list.some((i) => norm(i.name) === norm(name));

export const ALL_ITEM_NAMES = ITEMS.map((i) => i.name);
