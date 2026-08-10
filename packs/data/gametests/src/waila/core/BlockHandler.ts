/**
 *
 * @author
 * r4isen1920
 * https://mcpedl.com/user/r4isen1920
 *
 * @license
 * MIT License
 *
 */

import {
	Block,
	BlockInventoryComponent,
	EntityComponentTypes,
	ItemStack,
	Player,
	RawMessage,
} from "@minecraft/server";

import { LookAtBlockInterface } from "../types/LookAtObjectInterface";
import {
	BlockRenderDataInterface,
	ItemStackWithSlot,
} from "../types/LookAtObjectMetadataInterface";
import { LookAtObjectTypeEnum } from "../types/LookAtObjectTypeEnum";
import TagsInterface from "../types/TagsInterface";
import { BlockToolsEnum, TagRemarksEnum } from "../types/TagsEnum";

import blockTools from "../datasets/blockTools.json";
import { RuleMatcher } from "../utils/RuleMatcher";
import { STATE_NAME_ZH, STATE_VALUE_ZH } from "../utils/BlockStateNames";
import { MainHandContext, getMainHandContext } from "../utils/PlayerEquipment";
import WailaLogger from "../utils/Logger";



//#region Globals
const INVENTORY_SECOND_ROW_LIMIT = 18;




//#region BlockHandler
export class BlockHandler {
	private static readonly log = WailaLogger.get("BlockHandler");

	static createLookupData(block: Block): LookAtBlockInterface {
		return {
			type: LookAtObjectTypeEnum.TILE,
			hitIdentifier: BlockHandler.resolveHitIdentifier(block),
			block,
		};
	}

	static createRenderData(
		block: Block,
		player: Player,
		options?: { includeInventory?: boolean },
	): BlockRenderDataInterface {
		const includeInventory = options?.includeInventory ?? true;
		const extracted = includeInventory ? BlockHandler.extractInventory(block) : undefined;
		const renderData: BlockRenderDataInterface = {
			toolIcons: BlockHandler.buildToolIconString(block, player),
			blockStates: BlockHandler.describeStates(block),
			extraInfo: BlockHandler.buildExtraInfo(block),
		};

		if (includeInventory && extracted) {
			if (extracted.slots) {
				renderData.inventory = extracted.slots;
			}
			if (extracted.overflow > 0) {
				renderData.inventoryOverflow = extracted.overflow;
			}
		}

		return renderData;
	}

	private static resolveHitIdentifier(block: Block): string {
		try {
			const stack = block.getItemStack(1, true);
			if (stack?.typeId) return stack.typeId;
		} catch {
			/** intentionally empty */
		}
		return block.typeId;
	}

	private static buildToolIconString(block: Block, player: Player): string {
		const matches = BlockHandler.collectMatchingTags(block);
		if (matches.length === 0) {
			return `${BlockToolsEnum.UNDEFINED},${TagRemarksEnum.UNDEFINED};${BlockToolsEnum.UNDEFINED},${TagRemarksEnum.UNDEFINED}:`;
		}

		const mainHand = getMainHandContext(player);
		const processed: TagEvaluationResult[] = [];

		for (const tagDef of matches) {
			const iconId = BlockHandler.resolveToolIconId(tagDef.name);
			const remark = BlockHandler.resolveRemarkIcon(tagDef, mainHand);

			if (processed.some((entry) => entry.iconId.charAt(0) === iconId.charAt(0))) {
				continue;
			}

			processed.push({ iconId, remark });
			if (processed.length >= 2) break;
		}

		const [primary, secondary] = BlockHandler.padToolEntries(processed);
		return `${primary.iconId},${primary.remark};${secondary.iconId},${secondary.remark}:`;
	}

	private static collectMatchingTags(block: Block): TagsInterface[] {
		const blockId = block.typeId;
		const namespaceLess = blockId.includes(":") ? blockId.split(":")[1] : blockId;
		const blockTags = block.getTags();

		return (blockTools as TagsInterface[]).filter((tagDef) => {
			let hasPositiveMatch = false;

			for (const matcher of tagDef.target) {
				if (typeof matcher === "string") {
					const isNegated = matcher.startsWith("!");
					const rule = isNegated ? matcher.substring(1) : matcher;
					if (!rule) continue;

					const matches = BlockHandler.matchesBlockRule(rule, blockId, namespaceLess);
					if (matches) {
						if (isNegated) return false;
						hasPositiveMatch = true;
					}
					continue;
				}

				const tagRule = matcher.tag;
				if (!tagRule) continue;
				const isNegated = tagRule.startsWith("!");
				const actualRule = isNegated ? tagRule.substring(1) : tagRule;
				const matches = BlockHandler.matchesTagRule(actualRule, blockTags);

				if (matches) {
					if (isNegated) return false;
					hasPositiveMatch = true;
				} else if (!isNegated) {
					// positive tag that doesn't match does not immediately disqualify the entry,
					// but it also doesn't contribute to the positive match tally
				}
			}

			return hasPositiveMatch;
		});
	}

	private static matchesBlockRule(
		rule: string,
		blockId: string,
		namespaceLess: string,
	): boolean {
		return (
			RuleMatcher.matches(blockId, rule) ||
			RuleMatcher.matches(namespaceLess, rule)
		);
	}

	private static matchesTagRule(
		rule: string,
		blockTags: readonly string[],
	): boolean {
		return blockTags.some((tag) => RuleMatcher.matches(tag, rule));
	}

	private static matchesTagCondition(
		rule: string,
		tags: readonly string[],
	): boolean {
		if (!rule) return false;
		const isNegated = rule.startsWith("!");
		const actualRule = isNegated ? rule.substring(1) : rule;
		const positiveMatch = tags.some((tag) => RuleMatcher.matches(tag, actualRule));
		return isNegated ? !positiveMatch : positiveMatch;
	}

	private static matchesItemRule(rule: string, itemTypeId: string): boolean {
		if (!rule) return false;
		const isNegated = rule.startsWith("!");
		const actualRule = isNegated ? rule.substring(1) : rule;
		const value = itemTypeId;
		const namespaceLess = BlockHandler.getNamespaceLessIdentifier(value);
		const tokens = namespaceLess.split("_").filter(Boolean);

		let matched = false;

		if (actualRule.includes(":")) {
			matched = value === actualRule;
		} else {
			matched =
				namespaceLess === actualRule ||
				tokens.includes(actualRule);
		}

		return isNegated ? !matched : matched;
	}

	private static getNamespaceLessIdentifier(value: string): string {
		return value.includes(":") ? value.split(":")[1] : value;
	}

	private static resolveToolIconId(tagName: string): string {
		const key = tagName.toUpperCase();
		return (
			BlockToolsEnum[key as keyof typeof BlockToolsEnum] ??
			BlockToolsEnum.UNDEFINED
		);
	}

	private static resolveRemarkIcon(tagDef: TagsInterface, context: MainHandContext): TagRemarksEnum {
		if (!tagDef.remarks) return TagRemarksEnum.UNDEFINED;

		for (const remarkKey of Object.keys(tagDef.remarks)) {
			const enumKey = remarkKey.toUpperCase();
			if (!(enumKey in TagRemarksEnum)) continue;

			const remarkEnum = TagRemarksEnum[enumKey as keyof typeof TagRemarksEnum];
			const conditions = tagDef.remarks[remarkKey as keyof typeof tagDef.remarks]!;

			const matchesByTag = conditions.tags
				?.some((rule) => BlockHandler.matchesTagCondition(rule, context.tags)) ?? false;
			const matchesByItem = conditions.itemIds
				?.some((rule) => BlockHandler.matchesItemRule(rule, context.itemTypeId)) ?? false;

			if (matchesByTag || matchesByItem) {
				return remarkEnum;
			}
		}

		return TagRemarksEnum.UNDEFINED;
	}

	private static padToolEntries(entries: TagEvaluationResult[]): [TagEvaluationResult, TagEvaluationResult] {
		const defaultEntry: TagEvaluationResult = {
			iconId: BlockToolsEnum.UNDEFINED,
			remark: TagRemarksEnum.UNDEFINED,
		};
		return [entries[0] ?? defaultEntry, entries[1] ?? defaultEntry];
	}

	private static describeStates(block: Block): string | undefined {
		try {
			const states = block.permutation.getAllStates();
			const keys = Object.keys(states).sort();
			if (keys.length === 0) return undefined;

			return keys
				.map((key) => {
					const value = states[key as keyof typeof states];
					const rawKey = key.replace("minecraft:", "");
					const prefix = BlockHandler.colorForStateValue(value);
					// R4.8: 状态名/值中文化
					const nameZh = STATE_NAME_ZH[rawKey] ?? STATE_NAME_ZH[key] ?? rawKey;
					const valueStr = String(value);
					const valueZh = STATE_VALUE_ZH[valueStr] ?? valueStr;
					return `§7${nameZh}: ${prefix}${valueZh}§r`;
				})
				.join("\n");
		} catch {
			return undefined;
		}
	}

	private static colorForStateValue(value: unknown): string {
		if (typeof value === "number") return "§3";
		if (typeof value === "boolean") return value ? "§a" : "§c";
		return "§e";
	}

	// R4.8: 方块详细信息（借鉴 Block & Entity Details + 熔炉燃料）
	private static buildExtraInfo(block: Block): RawMessage[][] {
		const lines: RawMessage[][] = [];
		const typeId = block.typeId;
		const state = (name: string): unknown => {
			try {
				return block.permutation.getState(name as never);
			} catch {
				return undefined;
			}
		};

		// ── 生长进度（作物）──
		const growth = state("growth");
		if (typeof growth === "number") {
			const max = BlockHandler.cropMaxStage(typeId);
			const pct = max > 0 ? Math.round((growth / max) * 100) : undefined;
			if (pct !== undefined) {
				lines.push([{ text: `§7生长: ${pct >= 100 ? "§a" : "§e"}${pct}% §8(${growth}/${max})` }]);
			} else {
				lines.push([{ text: `§7生长: §e${growth}` }]);
			}
		}

		// ── 蜂蜜 ──
		const honey = state("honey_level");
		if (typeof honey === "number" && honey > 0) {
			lines.push([{ text: `§7蜂蜜: §e${honey}§7/§e5` }]);
		}

		// ── 堆肥 ──
		const compost = state("composter_fill_level");
		if (typeof compost === "number" && compost > 0) {
			lines.push([{ text: `§7堆肥: §e${compost}§7/§e8` }]);
		}

		// ── 炼药锅 ──
		if (typeId.includes("cauldron")) {
			const fill = state("fill_level");
			if (typeof fill === "number" && fill > 0) {
				lines.push([{ text: `§7填充: §b${fill}§7/§b6` }]);
			}
		}

		// ── 蜡烛 ──
		const candles = state("candles");
		if (typeof candles === "number" && candles > 0) {
			const lit = state("lit");
			const litText = lit ? "§6点亮" : "§8未点亮";
			lines.push([{ text: `§7蜡烛: §e${candles + 1} §7(${litText}§7)` }]);
		}

		// ── 红石信号 ──
		try {
			const power = block.getRedstonePower();
			if (typeof power === "number" && power > 0) {
				lines.push([{ text: `§7红石: §c${power}§7/§c15` }]);
			}
		} catch {
			/* 忽略 */
		}

		// ── 中继器延迟 ──
		const delay = state("repeater_delay");
		if (typeof delay === "number") {
			lines.push([{ text: `§7延迟: §e${delay} §7刻` }]);
		}

		// ── 耕地湿度 ──
		// 注意：moisturized_amount 状态值在 Bedrock 运行时读取不可靠（水边也返回 0），
		// 改用"4 格曼哈顿距离内检测水源"判断是否湿润
		if (typeId === "minecraft:farmland") {
			const moisture = state("moisturized_amount");
			const nearWater = BlockHandler.hasWaterNearby(block);
			// moisturized_amount 读取不可靠，只按水源检测显示状态（不显示虚假数值）
			const wet = nearWater || (typeof moisture === "number" && moisture > 0);
			lines.push([
				{
					text: wet
						? "§7湿度: §a湿润"
						: "§7湿度: §c干燥",
				},
			]);
		}

		// ── 海龟蛋 ──
		if (typeId === "minecraft:turtle_egg") {
			const eggs = state("turtle_egg_count");
			if (typeof eggs === "number") {
				lines.push([{ text: `§7蛋数: §e${eggs}` }]);
			}
			const cracked = state("cracked_state");
			if (typeof cracked === "string") {
				const map: Record<string, string> = {
					no_cracks: "§a完整",
					cracked: "§e有裂纹",
					max_cracked: "§c即将孵化",
				};
				lines.push([{ text: `§7状态: ${map[cracked] ?? `§f${cracked}`}§r` }]);
			}
		}

		// ── 末地传送门框架 ──
		if (typeId === "minecraft:frame") {
			const hasEye = state("end_portal_eye_bit");
			lines.push([{ text: `§7末影之眼: ${hasEye ? "§a是" : "§c否"}§r` }]);
		}

		// ── 熔炉/高炉/烟熏炉：燃烧状态 + 燃料 ──
		// 注意：Bedrock 熔炉点燃后方块 id 变成 minecraft:lit_furnace / lit_blast_furnace / lit_smoker，
		// 方块状态里没有 "lit" → 用 typeId 判断燃烧状态
		if (/furnace|smoker|blast_furnace/.test(typeId)) {
			try {
				const container = block.getComponent("minecraft:inventory") as
					| { container?: { getItem: (slot: number) => ItemStack | undefined } }
					| undefined;
				const inv = container?.container;
				const fuelItem = inv?.getItem(1);
				const inputItem = inv?.getItem(0);
				const isLit = /lit_/.test(typeId);
				if (isLit) {
					lines.push([{ text: "§7状态: §6冶炼中" }]);
					if (fuelItem) {
						const burnSec = BlockHandler.fuelBurnSeconds(fuelItem.typeId);
						const fuelKey = fuelItem.localizationKey ?? fuelItem.typeId;
						const burnLine: RawMessage[] = [{ text: "§7燃料: §e" }];
						burnLine.push({ translate: fuelKey });
						if (burnSec) burnLine.push({ text: ` §7(可烧 §b${burnSec}§7秒)` });
						lines.push(burnLine);
					}
					if (inputItem) {
						const inKey = inputItem.localizationKey ?? inputItem.typeId;
						const inLine: RawMessage[] = [{ text: "§7烧制: §e" }];
						inLine.push({ translate: inKey });
						inLine.push({ text: ` §7x${inputItem.amount}` });
						lines.push(inLine);
					}
				} else if (fuelItem) {
					lines.push([{ text: "§7状态: §8未点燃" }]);
				}
			} catch {
				/* 忽略 */
			}
		}

		return lines;
	}

	// 检测耕地方块 4 格（曼哈顿距离）内是否有水（水源或流动水）
	private static hasWaterNearby(block: Block): boolean {
		try {
			const { x, y, z } = block.location;
			const dim = block.dimension;
			for (let dx = -4; dx <= 4; dx++) {
				for (let dz = -4; dz <= 4; dz++) {
					if (Math.abs(dx) + Math.abs(dz) > 4) continue;
					const b = dim.getBlock({ x: x + dx, y, z: z + dz });
					if (
						b &&
						(b.typeId === "minecraft:water" ||
							b.typeId === "minecraft:flowing_water")
					) {
						return true;
					}
				}
			}
		} catch {
			/* 忽略 */
		}
		return false;
	}

	// 原版燃料 burn time（ticks → 秒）
	private static fuelBurnSeconds(typeId: string): number | undefined {
		const BURN_TICKS: Record<string, number> = {
			"minecraft:coal": 1600,
			"minecraft:charcoal": 1600,
			"minecraft:coal_block": 16000,
			"minecraft:stick": 100,
			"minecraft:oak_planks": 300,
			"minecraft:spruce_planks": 300,
			"minecraft:birch_planks": 300,
			"minecraft:jungle_planks": 300,
			"minecraft:acacia_planks": 300,
			"minecraft:dark_oak_planks": 300,
			"minecraft:mangrove_planks": 300,
			"minecraft:cherry_planks": 300,
			"minecraft:bamboo_planks": 300,
			"minecraft:crimson_planks": 300,
			"minecraft:warped_planks": 300,
			"minecraft:oak_log": 300,
			"minecraft:spruce_log": 300,
			"minecraft:birch_log": 300,
			"minecraft:jungle_log": 300,
			"minecraft:acacia_log": 300,
			"minecraft:dark_oak_log": 300,
			"minecraft:mangrove_log": 300,
			"minecraft:cherry_log": 300,
			"minecraft:wooden_pressure_plate": 300,
			"minecraft:wooden_button": 100,
			"minecraft:bow": 300,
			"minecraft:fishing_rod": 300,
			"minecraft:ladder": 300,
			"minecraft:chest": 300,
			"minecraft:trapped_chest": 300,
			"minecraft:crafting_table": 300,
			"minecraft:bookshelf": 300,
			"minecraft:sapling": 100,
			"minecraft:oak_sapling": 100,
			"minecraft:spruce_sapling": 100,
			"minecraft:birch_sapling": 100,
			"minecraft:jungle_sapling": 100,
			"minecraft:acacia_sapling": 100,
			"minecraft:dark_oak_sapling": 100,
			"minecraft:cherry_sapling": 100,
			"minecraft:bamboo": 50,
			"minecraft:dried_kelp_block": 4000,
			"minecraft:blast_furnace": 300,
			"minecraft:furnace": 300,
			"minecraft:smoker": 300,
			"minecraft:barrel": 300,
			"minecraft:cartography_table": 300,
			"minecraft:fletching_table": 300,
			"minecraft:smithing_table": 300,
			"minecraft:smoker_block": 300,
			"minecraft:composter": 300,
			"minecraft:loom": 300,
			"minecraft:stonecutter": 300,
			"minecraft:lectern": 300,
			"minecraft:daylight_detector": 300,
			"minecraft:jukebox": 300,
			"minecraft:note_block": 300,
			"minecraft:wooden_trapdoor": 300,
			"minecraft:oak_trapdoor": 300,
			"minecraft:spruce_trapdoor": 300,
			"minecraft:birch_trapdoor": 300,
			"minecraft:jungle_trapdoor": 300,
			"minecraft:acacia_trapdoor": 300,
			"minecraft:dark_oak_trapdoor": 300,
			"minecraft:mangrove_trapdoor": 300,
			"minecraft:cherry_trapdoor": 300,
			"minecraft:wooden_slab": 150,
			"minecraft:oak_slab": 150,
			"minecraft:spruce_slab": 150,
			"minecraft:birch_slab": 150,
			"minecraft:jungle_slab": 150,
			"minecraft:acacia_slab": 150,
			"minecraft:dark_oak_slab": 150,
			"minecraft:mangrove_slab": 150,
			"minecraft:cherry_slab": 150,
		};
		const ticks = BURN_TICKS[typeId];
		if (!ticks) return undefined;
		return Math.round(ticks / 20);
	}

	private static cropMaxStage(typeId: string): number {
		const map: Record<string, number> = {
			"minecraft:wheat": 7,
			"minecraft:potatoes": 7,
			"minecraft:carrots": 7,
			"minecraft:beetroot": 3,
			"minecraft:pitcher_crop": 4,
			"minecraft:torchflower_crop": 1,
			"minecraft:pumpkin_stem": 7,
			"minecraft:melon_stem": 7,
			"minecraft:sweet_berry_bush": 3,
			"minecraft:nether_wart": 3,
			"minecraft:cocoa": 2,
		};
		return map[typeId] ?? 0;
	}

	private static extractInventory(block: Block): ExtractedInventoryResult {
		const container = BlockHandler.getBlockContainer(block);
		if (!container) return { slots: undefined, overflow: 0 };

		const allNonEmpty = BlockHandler.collectNonEmptyStacks(container);

		if (container.size > INVENTORY_SECOND_ROW_LIMIT) {
			if (allNonEmpty.length === 0) return { slots: undefined, overflow: 0 };
			const packed = BlockHandler.packIntoTwoRows(allNonEmpty);
			const slots = packed.slots;
			const overflow = Math.max(0, packed.aggregatedSize - slots.length);
			return {
				slots: slots.length > 0 ? slots : undefined,
				overflow,
			};
		}

		const mirrored = BlockHandler.mirrorContainer(container);
		if (!mirrored) return { slots: undefined, overflow: 0 };
		const overflow = Math.max(0, allNonEmpty.length - mirrored.mirroredNonEmpty);
		return {
			slots: mirrored.slots,
			overflow,
		};
	}

	private static getBlockContainer(block: Block): BlockContainer | undefined {
		const component = block.getComponent(
			EntityComponentTypes.Inventory,
		) as BlockInventoryComponent | undefined;
		return component?.container ?? undefined;
	}

	private static collectNonEmptyStacks(container: BlockContainer): ItemStack[] {
		const result: ItemStack[] = [];
		for (let i = 0; i < container.size; i++) {
			const stack = container.getItem(i);
			if (stack && stack.typeId !== "minecraft:air" && stack.amount > 0) {
				result.push(stack);
			}
		}
		return result;
	}

	private static packIntoTwoRows(items: ItemStack[]): { slots: ItemStackWithSlot[]; aggregatedSize: number } {
		const aggregated = BlockHandler.aggregateStackableItems(items);
		const allowedSlots: number[] = [];
		for (let index = 0; index < INVENTORY_SECOND_ROW_LIMIT; index++) {
			if (index === 8) continue;
			allowedSlots.push(index);
		}

		const slots: ItemStackWithSlot[] = [];
		for (let i = 0; i < allowedSlots.length; i++) {
			const item = aggregated[i];
			if (!item) break;
			slots.push({ item, slot: allowedSlots[i] });
		}
		return { slots, aggregatedSize: aggregated.length };
	}

	private static mirrorContainer(container: BlockContainer): MirroredInventoryResult | undefined {
		const rendered: ItemStackWithSlot[] = [];
		let mirroredNonEmpty = 0;
		for (let slot = 0; slot < container.size; slot++) {
			const mapped = slot < 8 ? slot : slot + 1;
			if (mapped >= INVENTORY_SECOND_ROW_LIMIT) break;
			const stack = container.getItem(slot);
			if (stack && stack.typeId !== "minecraft:air" && stack.amount > 0) {
				mirroredNonEmpty++;
			}
			rendered.push({ item: stack ?? new ItemStack("minecraft:air"), slot: mapped });
		}
		return mirroredNonEmpty > 0 ? { slots: rendered, mirroredNonEmpty } : undefined;
	}

	private static aggregateStackableItems(items: ItemStack[]): ItemStack[] {
		if (items.length === 0) return items;

		const order: AggregationOrderEntry[] = [];
		const buckets = new Map<string, StackAggregationBucket>();

		for (const item of items) {
			if (!item) continue;
			if (!BlockHandler.isStackableCandidate(item)) {
				order.push({ kind: "single", stack: item });
				continue;
			}

			const key = item.typeId;
			let bucket = buckets.get(key);
			if (!bucket) {
				bucket = {
					template: item,
					maxAmount: BlockHandler.resolveMaxStackSize(item),
					total: 0,
				};
				buckets.set(key, bucket);
				order.push({ kind: "bucket", key });
			}
			bucket.total += Math.max(0, item.amount);
		}

		const aggregated: ItemStack[] = [];
		for (const entry of order) {
			if (entry.kind === "single") {
				aggregated.push(entry.stack);
				continue;
			}

			const bucket = buckets.get(entry.key);
			if (!bucket) continue;

			let remaining = bucket.total;
			const maxStack = Math.max(1, bucket.maxAmount);
			while (remaining > 0) {
				const portion = Math.min(maxStack, remaining);
				const clone = BlockHandler.cloneItemForAggregation(bucket.template, portion);
				if (clone) {
					aggregated.push(clone);
				}
				remaining -= portion;
			}
			buckets.delete(entry.key);
		}

		return aggregated;
	}

	private static isStackableCandidate(item: ItemStack): boolean {
		if (!item || item.amount <= 0) return false;
		if (item.isStackable !== true) return false;
		const maxAmount = typeof item.maxAmount === "number" ? item.maxAmount : 0;
		return maxAmount > 1;
	}

	private static resolveMaxStackSize(item: ItemStack): number {
		const maxAmount = typeof item.maxAmount === "number" ? item.maxAmount : 0;
		return maxAmount > 0 ? maxAmount : 64;
	}

	private static cloneItemForAggregation(source: ItemStack, amount: number): ItemStack | undefined {
		try {
			const clone = source.clone();
			clone.amount = amount;
			return clone;
		} catch (error) {
			BlockHandler.log.debug?.(`Failed to clone stack for aggregation: ${error}`);
			try {
				const fallback = new ItemStack(source.typeId, amount);
				fallback.amount = amount;
				return fallback;
			} catch (creationError) {
				BlockHandler.log.warn(`Failed to create fallback stack for ${source.typeId}: ${creationError}`);
				return undefined;
			}
		}
	}
}



//#region Types
type BlockContainer = NonNullable<BlockInventoryComponent["container"]>;

interface ExtractedInventoryResult {
	slots?: ItemStackWithSlot[];
	overflow: number;
}

interface MirroredInventoryResult {
	slots: ItemStackWithSlot[];
	mirroredNonEmpty: number;
}

interface TagEvaluationResult {
	iconId: string;
	remark: TagRemarksEnum;
}

interface StackAggregationBucket {
	template: ItemStack;
	maxAmount: number;
	total: number;
}

type AggregationOrderEntry =
	| { kind: "single"; stack: ItemStack }
	| { kind: "bucket"; key: string };