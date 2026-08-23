// Generated from the guild's "Blacksmith Recipies" doc — a one-time extraction,
// not a live feed, so edits to the doc need a re-run of the generator.
//
// The doc was transcribed from gameplay footage, hence the note below: some
// ingredient counts are marked "(?)" in the source and are kept verbatim rather
// than cleaned up, so nobody mistakes a guess for a confirmed figure.

export interface RecipeIngredient {
  qty: number;
  item: string;
}

export interface Recipe {
  category: string;
  name: string;
  /** Armour rating, or damage for weapons. 0 where the doc lists none. */
  stat: number;
  ingredients: RecipeIngredient[];
}

export const RECIPE_NOTE =
  "Note: ingredients marked (?) were partially obscured by screen glare in the source footage \u2014 verify counts in-game. Item stats reflect the modded values shown at the Skyforge, not vanilla.";

export const RECIPES: Recipe[] = [
  { category: "Jewelry", name: "Jade and Sapphire Circlet", stat: 0, ingredients: [{ qty: 1, item: "Refined Malachite" }, { qty: 1, item: "Sapphire" }] },
  { category: "Jewelry", name: "Silver Amethyst Ring", stat: 0, ingredients: [{ qty: 1, item: "Amethyst" }, { qty: 1, item: "Silver Ingot" }] },
  { category: "Jewelry", name: "Silver and Moonstone Circlet", stat: 0, ingredients: [{ qty: 2, item: "Silver Ingot" }, { qty: 1, item: "Refined Moonstone" }] },
  { category: "Jewelry", name: "Silver and Sapphire Circletarr", stat: 0, ingredients: [{ qty: 2, item: "Silver Ingot" }, { qty: 1, item: "Sapphire" }] },
  { category: "Jewelry", name: "Silver Emerald Necklace", stat: 0, ingredients: [{ qty: 1, item: "Flawless Emerald" }, { qty: 1, item: "Silver Ingot" }] },
  { category: "Jewelry", name: "Silver Garnet Ring", stat: 0, ingredients: [{ qty: 1, item: "Garnet" }, { qty: 1, item: "Silver Ingot" }] },
  { category: "Jewelry", name: "Silver Jeweled Necklace", stat: 0, ingredients: [{ qty: 2, item: "Flawless Garnet" }, { qty: 1, item: "Silver Ingot" }] },
  { category: "Jewelry", name: "Silver Necklace", stat: 0, ingredients: [{ qty: 1, item: "Silver Ingot" }] },
  { category: "Jewelry", name: "Silver Ring", stat: 0, ingredients: [{ qty: 1, item: "Silver Ingot" }] },
  { category: "Jewelry", name: "Silver Ruby Ring", stat: 0, ingredients: [{ qty: 1, item: "Ruby" }, { qty: 1, item: "Silver Ingot" }] },
  { category: "Jewelry", name: "Silver Sapphire Necklace", stat: 0, ingredients: [{ qty: 1, item: "Silver Ingot" }, { qty: 1, item: "Flawless Sapphire" }] },
  { category: "Light Armor", name: "Large Fur Collar", stat: 0, ingredients: [{ qty: 1, item: "Leather Strips" }, { qty: 2, item: "Leather" }] },
  { category: "Light Armor", name: "Leather Armor", stat: 29, ingredients: [{ qty: 4, item: "Leather" }, { qty: 3, item: "Leather Strips" }] },
  { category: "Light Armor", name: "Leather Boots", stat: 8, ingredients: [{ qty: 2, item: "Leather" }, { qty: 2, item: "Leather Strips" }] },
  { category: "Light Armor", name: "Leather Helmet", stat: 13, ingredients: [{ qty: 2, item: "Leather" }, { qty: 1, item: "Leather Strips" }] },
  { category: "Light Armor", name: "Mail and Jacket", stat: 36, ingredients: [{ qty: 1, item: "Linen Wrap" }, { qty: 4, item: "Leather Strips" }, { qty: 2, item: "Iron Ingot" }] },
  { category: "Light Armor", name: "Northern Fur Boots", stat: 7, ingredients: [{ qty: 2, item: "Leather Strips" }, { qty: 2, item: "Leather" }] },
  { category: "Light Armor", name: "Northern Fur Gloves", stat: 7, ingredients: [{ qty: 2, item: "Leather Strips" }, { qty: 1, item: "Leather" }] },
  { category: "Light Armor", name: "Northern Fur Hat", stat: 12, ingredients: [{ qty: 1, item: "Leather Strips" }, { qty: 2, item: "Leather" }] },
  { category: "Light Armor", name: "Northern Fur Shield", stat: 17, ingredients: [{ qty: 2, item: "Leather Strips" }, { qty: 4, item: "Leather" }] },
  { category: "Light Armor", name: "Northern Hide Armor", stat: 22, ingredients: [{ qty: 3, item: "Leather Strips" }, { qty: 4, item: "Leather" }] },
  { category: "Light Armor", name: "Northern Hide Boots", stat: 6, ingredients: [{ qty: 2, item: "Leather Strips" }, { qty: 2, item: "Leather" }] },
  { category: "Light Armor", name: "Northern Hide Gauntlets", stat: 6, ingredients: [{ qty: 2, item: "Leather Strips" }, { qty: 1, item: "Leather" }] },
  { category: "Light Armor", name: "Northern Hide Helmet", stat: 11, ingredients: [{ qty: 1, item: "Leather Strips" }, { qty: 2, item: "Leather" }] },
  { category: "Light Armor", name: "Northern Leather Armor", stat: 29, ingredients: [{ qty: 3, item: "Leather Strips" }, { qty: 4, item: "Leather" }] },
  { category: "Light Armor", name: "Northern Studded Armor", stat: 25, ingredients: [{ qty: 1, item: "Iron Ingot" }, { qty: 3, item: "Leather Strips" }, { qty: 4, item: "Leather" }] },
  { category: "Light Armor", name: "Oiled Mail and Hide Armor", stat: 35, ingredients: [{ qty: 1, item: "Hide Armor" }, { qty: 4, item: "Leather Strips" }, { qty: 2, item: "Iron Ingot" }] },
  { category: "Light Armor", name: "Oiled Mail and Jacket", stat: 38, ingredients: [{ qty: 1, item: "Linen Wrap" }, { qty: 4, item: "Leather Strips" }, { qty: 2, item: "Iron Ingot" }] },
  { category: "Light Armor", name: "Oiled Mail Hauberk", stat: 30, ingredients: [{ qty: 1, item: "Linen Wrap" }, { qty: 4, item: "Leather Strips" }, { qty: 2, item: "Iron Ingot" }] },
  { category: "Light Armor", name: "Rogue's Hide Armor", stat: 22, ingredients: [{ qty: 3, item: "Leather Strips" }, { qty: 4, item: "Leather" }] },
  { category: "Light Armor", name: "Rogue's Hide Gloves", stat: 6, ingredients: [{ qty: 2, item: "Leather Strips" }, { qty: 1, item: "Leather" }] },
  { category: "Light Armor", name: "Rogue's Hood", stat: 11, ingredients: [{ qty: 1, item: "Leather Strips" }, { qty: 2, item: "Leather" }] },
  { category: "Light Armor", name: "Rogue's Hood, Lowered", stat: 11, ingredients: [{ qty: 1, item: "Leather Strips" }, { qty: 2, item: "Leather" }] },
  { category: "Light Armor", name: "Rugged Leather Armor", stat: 29, ingredients: [{ qty: 3, item: "Leather Strips" }, { qty: 4, item: "Leather" }] },
  { category: "Light Armor", name: "Rugged Leather Boots", stat: 8, ingredients: [{ qty: 2, item: "Leather Strips" }, { qty: 2, item: "Leather" }] },
  { category: "Light Armor", name: "Rugged Leather Gauntlets", stat: 8, ingredients: [{ qty: 2, item: "Leather Strips" }, { qty: 1, item: "Leather" }] },
  { category: "Light Armor", name: "Rugged Leather Helmet", stat: 13, ingredients: [{ qty: 1, item: "Leather Strips" }, { qty: 2, item: "Leather" }] },
  { category: "Light Armor", name: "Rugged Leather Shield", stat: 17, ingredients: [{ qty: 2, item: "Leather Strips" }, { qty: 4, item: "Leather" }] },
  { category: "Light Armor", name: "Studded Armor", stat: 25, ingredients: [{ qty: 2, item: "Leather Strips (?)" }, { qty: 4, item: "Leather" }, { qty: 1, item: "Iron Ingot" }] },
  { category: "Light Armor", name: "Stormcloak Braided Armor", stat: 25, ingredients: [{ qty: 2, item: "Steel Ingot" }, { qty: 3, item: "Leather Strips" }, { qty: 2, item: "Leather" }] },
  { category: "Light Armor", name: "Stormcloak Conical Helmet", stat: 12, ingredients: [{ qty: 1, item: "Steel Ingot" }, { qty: 1, item: "Leather Strips" }, { qty: 1, item: "Leather" }] },
  { category: "Light Armor", name: "Stormcloak Hide Armor", stat: 25, ingredients: [{ qty: 2, item: "Steel Ingot (?)" }, { qty: 3, item: "Leather Strips" }, { qty: 2, item: "Leather" }] },
  { category: "Light Armor", name: "Stormcloak Hide Gauntlets", stat: 7, ingredients: [{ qty: 1, item: "Steel Ingot" }, { qty: 2, item: "Leather Strips" }, { qty: 1, item: "Leather" }] },
  { category: "Light Armor", name: "Stormcloak Hide Helmet", stat: 12, ingredients: [{ qty: 1, item: "Steel Ingot" }, { qty: 1, item: "Leather Strips" }, { qty: 1, item: "Leather" }] },
  { category: "Light Armor", name: "Stormcloak Leather Helmet", stat: 12, ingredients: [{ qty: 1, item: "Steel Ingot" }, { qty: 1, item: "Leather Strips" }, { qty: 1, item: "Leather" }] },
  { category: "Light Armor", name: "Stormcloak Light Shield", stat: 21, ingredients: [{ qty: 2, item: "Steel Ingot" }, { qty: 2, item: "Leather Strips" }] },
  { category: "Light Armor", name: "Stormcloak Soldier Boots", stat: 7, ingredients: [{ qty: 1, item: "Steel Ingot" }, { qty: 2, item: "Leather Strips" }, { qty: 1, item: "Leather" }] },
  { category: "Light Armor", name: "Stormcloak Soldier Gauntlets", stat: 7, ingredients: [{ qty: 1, item: "Steel Ingot" }, { qty: 2, item: "Leather Strips" }, { qty: 1, item: "Leather" }] },
  { category: "Light Armor", name: "Stormcloak Soldier Helmet", stat: 12, ingredients: [{ qty: 1, item: "Steel Ingot" }, { qty: 1, item: "Leather Strips" }, { qty: 1, item: "Leather" }] },
  { category: "Heavy Armor", name: "Northern Iron Armor", stat: 27, ingredients: [{ qty: 5, item: "Iron Ingot" }, { qty: 3, item: "Leather Strips" }] },
  { category: "Heavy Armor", name: "Northern Iron Boots", stat: 11, ingredients: [{ qty: 3, item: "Iron Ingot" }, { qty: 2, item: "Leather Strips" }] },
  { category: "Heavy Armor", name: "Northern Iron Gauntlets", stat: 11, ingredients: [{ qty: 2, item: "Iron Ingot" }, { qty: 2, item: "Leather Strips" }] },
  { category: "Heavy Armor", name: "Northern Iron Helmet", stat: 16, ingredients: [{ qty: 3, item: "Iron Ingot" }, { qty: 2, item: "Leather Strips" }] },
  { category: "Heavy Armor", name: "Northern Steel Armor", stat: 33, ingredients: [{ qty: 1, item: "Iron Ingot" }, { qty: 4, item: "Steel Ingot" }, { qty: 3, item: "Leather Strips" }] },
  { category: "Heavy Armor", name: "Northern Steel Gauntlets", stat: 13, ingredients: [{ qty: 1, item: "Iron Ingot" }, { qty: 2, item: "Steel Ingot" }, { qty: 2, item: "Leather Strips" }] },
  { category: "Heavy Armor", name: "Northern Steel Helmet", stat: 19, ingredients: [{ qty: 1, item: "Iron Ingot" }, { qty: 2, item: "Steel Ingot" }, { qty: 2, item: "Leather Strips" }] },
  { category: "Heavy Armor", name: "Rugged Iron Armor", stat: 27, ingredients: [{ qty: 5, item: "Iron Ingot" }, { qty: 3, item: "Leather Strips" }] },
  { category: "Heavy Armor", name: "Rugged Iron Boots", stat: 11, ingredients: [{ qty: 3, item: "Iron Ingot" }, { qty: 2, item: "Leather Strips" }] },
  { category: "Heavy Armor", name: "Rugged Iron Gauntlets", stat: 11, ingredients: [{ qty: 2, item: "Iron Ingot" }, { qty: 2, item: "Leather Strips" }] },
  { category: "Heavy Armor", name: "Rugged Iron Helmet", stat: 16, ingredients: [{ qty: 3, item: "Iron Ingot" }, { qty: 2, item: "Leather Strips" }] },
  { category: "Heavy Armor", name: "Rugged Steel Boots", stat: 13, ingredients: [{ qty: 1, item: "Iron Ingot" }, { qty: 3, item: "Steel Ingot" }, { qty: 2, item: "Leather Strips" }] },
  { category: "Heavy Armor", name: "Rugged Steel Gauntlets", stat: 13, ingredients: [{ qty: 1, item: "Iron Ingot" }, { qty: 2, item: "Steel Ingot" }, { qty: 2, item: "Leather Strips" }] },
  { category: "Heavy Armor", name: "Rugged Steel Shield", stat: 26, ingredients: [{ qty: 1, item: "Iron Ingot" }, { qty: 3, item: "Steel Ingot" }, { qty: 1, item: "Leather Strips" }] },
  { category: "Heavy Armor", name: "Runic Iron Boots", stat: 11, ingredients: [{ qty: 3, item: "Iron Ingot" }, { qty: 2, item: "Leather Strips" }] },
  { category: "Heavy Armor", name: "Runic Iron Gauntlets", stat: 11, ingredients: [{ qty: 2, item: "Iron Ingot" }, { qty: 2, item: "Leather Strips" }] },
  { category: "Heavy Armor", name: "Runic Iron Helmet", stat: 16, ingredients: [{ qty: 3, item: "Iron Ingot" }, { qty: 2, item: "Leather Strips" }] },
  { category: "Heavy Armor", name: "Steel Armor", stat: 33, ingredients: [{ qty: 1, item: "Iron Ingot" }, { qty: 4, item: "Steel Ingot" }, { qty: 3, item: "Leather Strips" }] },
  { category: "Heavy Armor", name: "Steel Cuffed Boots", stat: 13, ingredients: [{ qty: 1, item: "Iron Ingot" }, { qty: 3, item: "Steel Ingot" }, { qty: 2, item: "Leather Strips" }] },
  { category: "Heavy Armor", name: "Steel Helmet", stat: 19, ingredients: [{ qty: 2, item: "Leather Strips" }, { qty: 2, item: "Steel Ingot" }, { qty: 1, item: "Iron Ingot" }] },
  { category: "Heavy Armor", name: "Steel Horned Helmet", stat: 19, ingredients: [{ qty: 2, item: "Leather Strips" }, { qty: 2, item: "Steel Ingot" }, { qty: 1, item: "Iron Ingot" }] },
  { category: "Heavy Armor", name: "Steel Imperial Gauntlets", stat: 13, ingredients: [{ qty: 2, item: "Leather Strips" }, { qty: 2, item: "Steel Ingot" }, { qty: 1, item: "Iron Ingot" }] },
  { category: "Heavy Armor", name: "Steel Nordic Gauntlets", stat: 13, ingredients: [{ qty: 1, item: "Iron Ingot" }, { qty: 2, item: "Steel Ingot" }, { qty: 2, item: "Leather Strips" }] },
  { category: "Heavy Armor", name: "Steel Shield", stat: 26, ingredients: [{ qty: 1, item: "Leather Strips" }, { qty: 3, item: "Steel Ingot" }, { qty: 1, item: "Iron Ingot" }] },
  { category: "Heavy Armor", name: "Steel Shin Boots", stat: 13, ingredients: [{ qty: 2, item: "Leather Strips" }, { qty: 1, item: "Iron Ingot" }, { qty: 3, item: "Steel Ingot" }] },
  { category: "Heavy Armor", name: "Stormcloak Chainmail Armor", stat: 27, ingredients: [{ qty: 1, item: "Steel Ingot (2\u20133?)" }, { qty: 2, item: "Leather Strips" }, { qty: 2, item: "Leather" }] },
  { category: "Heavy Armor", name: "Stormcloak Heavy Iron Helmet", stat: 16, ingredients: [{ qty: 2, item: "Steel Ingot" }, { qty: 1, item: "Leather Strips" }, { qty: 1, item: "Leather" }] },
  { category: "Heavy Armor", name: "Stormcloak Heavy Lamellar Armor", stat: 27, ingredients: [{ qty: 1, item: "Steel Ingot (?)" }, { qty: 2, item: "Leather Strips" }, { qty: 2, item: "Leather" }] },
  { category: "Heavy Armor", name: "Stormcloak Heavy Lamellar Boots", stat: 11, ingredients: [{ qty: 2, item: "Steel Ingot" }, { qty: 2, item: "Leather Strips" }, { qty: 1, item: "Leather" }] },
  { category: "Heavy Armor", name: "Stormcloak Heavy Lamellar Gauntlets", stat: 11, ingredients: [{ qty: 2, item: "Steel Ingot" }, { qty: 2, item: "Leather Strips" }, { qty: 1, item: "Leather" }] },
  { category: "Heavy Armor", name: "Stormcloak Heavy Soldier Boots", stat: 11, ingredients: [{ qty: 2, item: "Steel Ingot" }, { qty: 2, item: "Leather Strips" }, { qty: 1, item: "Leather" }] },
  { category: "Heavy Armor", name: "Stormcloak Heavy Soldier Gauntlets", stat: 11, ingredients: [{ qty: 2, item: "Steel Ingot" }, { qty: 2, item: "Leather Strips" }, { qty: 1, item: "Leather" }] },
  { category: "Heavy Armor", name: "Stormcloak Heavy Soldier Helmet", stat: 16, ingredients: [{ qty: 2, item: "Steel Ingot" }, { qty: 1, item: "Leather Strips" }, { qty: 1, item: "Leather" }] },
  { category: "Heavy Armor", name: "Stormcloak Iron Helmet", stat: 16, ingredients: [{ qty: 2, item: "Steel Ingot" }, { qty: 2, item: "Leather Strips" }, { qty: 1, item: "Leather" }] },
  { category: "Heavy Armor", name: "Stormcloak Lamellar Armor", stat: 27, ingredients: [{ qty: 1, item: "Steel Ingot (?)" }, { qty: 2, item: "Leather Strips" }, { qty: 2, item: "Leather" }] },
  { category: "Heavy Armor", name: "Stormcloak Lamellar Boots", stat: 11, ingredients: [{ qty: 2, item: "Steel Ingot" }, { qty: 2, item: "Leather Strips" }, { qty: 1, item: "Leather" }] },
  { category: "Heavy Armor", name: "Stormcloak Shield", stat: 22, ingredients: [{ qty: 4, item: "Steel Ingot" }, { qty: 2, item: "Leather Strips" }] },
  { category: "Heavy Armor", name: "Wrought Iron Boots", stat: 11, ingredients: [{ qty: 3, item: "Iron Ingot" }, { qty: 2, item: "Leather Strips" }] },
  { category: "Heavy Armor", name: "Wrought Iron Gauntlets", stat: 11, ingredients: [{ qty: 2, item: "Iron Ingot" }, { qty: 2, item: "Leather Strips" }] },
  { category: "Heavy Armor", name: "Wrought Iron Helmet", stat: 16, ingredients: [{ qty: 3, item: "Iron Ingot" }, { qty: 2, item: "Leather Strips" }] },
  { category: "Weapons & Ammo", name: "Long Bow", stat: 6, ingredients: [{ qty: 8, item: "Firewood" }, { qty: 2, item: "Leather Strips" }, { qty: 1, item: "Leather" }] },
  { category: "Weapons & Ammo", name: "Northern Iron Battleaxe", stat: 18, ingredients: [{ qty: 4, item: "Iron Ingot" }, { qty: 2, item: "Leather Strips" }] },
  { category: "Weapons & Ammo", name: "Northern Iron Greatsword", stat: 17, ingredients: [{ qty: 4, item: "Iron Ingot" }, { qty: 2, item: "Leather Strips" }] },
  { category: "Weapons & Ammo", name: "Northern Iron Mace", stat: 10, ingredients: [{ qty: 3, item: "Iron Ingot" }, { qty: 2, item: "Leather Strips" }] },
  { category: "Weapons & Ammo", name: "Northern Iron War Axe", stat: 9, ingredients: [{ qty: 2, item: "Iron Ingot" }, { qty: 2, item: "Leather Strips" }] },
  { category: "Weapons & Ammo", name: "Northern Iron Warhammer", stat: 20, ingredients: [{ qty: 4, item: "Iron Ingot" }, { qty: 3, item: "Leather Strips" }] },
  { category: "Weapons & Ammo", name: "Steel Arrow", stat: 10, ingredients: [{ qty: 1, item: "Steel Ingot" }, { qty: 1, item: "Firewood" }] },
  { category: "Weapons & Ammo", name: "Steel Battleaxe", stat: 20, ingredients: [{ qty: 1, item: "Iron Ingot" }, { qty: 2, item: "Leather Strips" }, { qty: 4, item: "Steel Ingot" }] },
  { category: "Weapons & Ammo", name: "Steel Dagger", stat: 6, ingredients: [{ qty: 1, item: "Steel Ingot" }, { qty: 1, item: "Leather Strips" }, { qty: 1, item: "Iron Ingot" }] },
  { category: "Weapons & Ammo", name: "Steel Greatsword", stat: 19, ingredients: [{ qty: 2, item: "Iron Ingot" }, { qty: 3, item: "Leather Strips" }, { qty: 4, item: "Steel Ingot" }] },
  { category: "Weapons & Ammo", name: "Steel Sword", stat: 9, ingredients: [{ qty: 1, item: "Iron Ingot" }, { qty: 1, item: "Leather Strips" }, { qty: 2, item: "Steel Ingot" }] },
  { category: "Weapons & Ammo", name: "Steel War Axe", stat: 10, ingredients: [{ qty: 2, item: "Steel Ingot" }, { qty: 2, item: "Leather Strips" }, { qty: 1, item: "Iron Ingot" }] },
  { category: "Weapons & Ammo", name: "Steel Warhammer", stat: 23, ingredients: [{ qty: 1, item: "Iron Ingot" }, { qty: 3, item: "Leather Strips" }, { qty: 4, item: "Steel Ingot" }] },
];

/** Weapons are rated by damage; everything else by armour. */
export const statLabel = (category: string) =>
  /weapon|ammo|arrow|bow/i.test(category) ? 'Damage' : 'Armor';
