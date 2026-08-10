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

import { Player } from "@minecraft/server";
import WailaLogger from "../utils/Logger";



//#region API
/**
 * Handles options and per-player settings for WAILA.
 */
export class WailaSettings {
	static readonly NAMESPACE = "r4isen1920_waila";
	static readonly log = WailaLogger.get("Settings");
	static readonly DEFAULT_VIEW_DISTANCE = 8;

	private static initialized = false;
	private static readonly categoryRegistry: RegisteredCategory[] = [];
	private static readonly settingRegistry: RegisteredSetting[] = [];
	private static readonly settingsMap: Map<string, RegisteredSetting> = new Map();

	private static readonly DISPLAY_POSITION_OPTIONS: { value: WailaDisplayPosition; labelKey: string }[] = [
		{ value: "top_left", labelKey: "waila.settings.displayPosition.option.top_left" },
		{ value: "top_middle", labelKey: "waila.settings.displayPosition.option.top_middle" },
		{ value: "top_right", labelKey: "waila.settings.displayPosition.option.top_right" },
		{ value: "left_middle", labelKey: "waila.settings.displayPosition.option.left_middle" },
		{ value: "center", labelKey: "waila.settings.displayPosition.option.center" },
		{ value: "right_middle", labelKey: "waila.settings.displayPosition.option.right_middle" },
		{ value: "bottom_left", labelKey: "waila.settings.displayPosition.option.bottom_left" },
		{ value: "bottom_middle", labelKey: "waila.settings.displayPosition.option.bottom_middle" },
		{ value: "bottom_right", labelKey: "waila.settings.displayPosition.option.bottom_right" },
	];

	private static readonly WHEN_TO_SHOW_OPTIONS: { value: WailaWhenToShowOption; labelKey: string }[] = [
		{ value: "always", labelKey: "waila.settings.whenToShow.option.always" },
		{ value: "when_not_sneaking", labelKey: "waila.settings.whenToShow.option.when_not_sneaking" },
		{ value: "when_sneaking", labelKey: "waila.settings.whenToShow.option.when_sneaking" },
		{ value: "never", labelKey: "waila.settings.whenToShow.option.never" },
	];

	/** Returns all setting keys. */
	static keys(): string[] {
		this.ensureInitialized();
		return this.settingRegistry.map((entry) => entry.key);
	}

	/** Returns entries of [key, setting] from the schema. */
	static entries(): [string, WailaSetting][] {
		this.ensureInitialized();
		return this.settingRegistry.map((entry) => [entry.key, entry.definition] as [string, WailaSetting]);
	}

	/**
	 * Get a single setting value for a player, normalized to the correct primitive type.
	 * Falls back to the setting default when no value has been stored yet.
	 */
	static get(player: Player, key: "isEnabled"): boolean;
	static get(player: Player, key: "displayPosition"): WailaDisplayPosition;
	static get(player: Player, key: "displayPositionWhenSneaking"): WailaDisplayPosition;
	static get(player: Player, key: "blockStatesVisibility"): WailaWhenToShowOption;
	static get(player: Player, key: "effectiveToolVisibility"): WailaWhenToShowOption;
	static get(player: Player, key: "containerInventoryVisibility"): WailaWhenToShowOption;
	static get(player: Player, key: "entityTagsVisibility"): WailaWhenToShowOption;
	static get(player: Player, key: "entityHealthVisibility"): WailaWhenToShowOption;
	static get(player: Player, key: "entityEffectsVisibility"): WailaWhenToShowOption;
	static get(player: Player, key: "packAuthorVisibility"): WailaWhenToShowOption;
	static get(player: Player, key: "alwaysDisplayEntityIntHealth"): boolean;
	static get(player: Player, key: string): WailaSettingPrimitive;
	static get(player: Player, key: string): WailaSettingPrimitive {
		this.ensureInitialized();
		const entry = this.settingsMap.get(key);
		if (!entry) throw new Error(`Unknown WAILA setting: ${key}`);
		const setting = entry.definition;
		const stored = player.getDynamicProperty(this.propertyKey(key));
		if (stored === undefined || stored === null)
			return setting.default as WailaSettingPrimitive;

		switch (setting.type) {
			case "boolean":
				return typeof stored === "boolean"
					? stored
					: (setting.default as boolean);
			case "number":
				return typeof stored === "number"
					? stored
					: (setting.default as number);
			case "string":
				return typeof stored === "string"
					? stored
					: (setting.default as string);
			case "enum":
				return this.normalizeEnumStoredValue(setting, stored);
		}
	}

	/**
	 * Get all settings for a player as a simple record.
	 */
	static getAll(player: Player): Record<string, WailaSettingPrimitive> {
		const out: Record<string, WailaSettingPrimitive> = {};
		for (const [key] of this.entries()) {
			out[key] = this.get(player, key);
		}
		return out;
	}

	/**
	 * Get all settings with strong typing per known keys.
	 */
	static getAllTyped(player: Player): WailaSettingsValues {
		return {
			isEnabled: this.get(player, "isEnabled") as boolean,
			displayPosition: this.get(player, "displayPosition") as WailaDisplayPosition,
			displayPositionWhenSneaking: this.get(player, "displayPositionWhenSneaking") as WailaDisplayPosition,
			blockStatesVisibility: this.get(player, "blockStatesVisibility") as WailaWhenToShowOption,
			effectiveToolVisibility: this.get(player, "effectiveToolVisibility") as WailaWhenToShowOption,
			containerInventoryVisibility: this.get(player, "containerInventoryVisibility") as WailaWhenToShowOption,
			entityTagsVisibility: this.get(player, "entityTagsVisibility") as WailaWhenToShowOption,
			entityHealthVisibility: this.get(player, "entityHealthVisibility") as WailaWhenToShowOption,
			alwaysDisplayEntityIntHealth: this.get(player, "alwaysDisplayEntityIntHealth") as boolean,
			entityEffectsVisibility: this.get(player, "entityEffectsVisibility") as WailaWhenToShowOption,
			packAuthorVisibility: this.get(player, "packAuthorVisibility") as WailaWhenToShowOption,
		};
	}

	/**
	 * Set a setting value for a player. The value will be validated and normalized to the
	 * correct type based on the schema. Returns true if stored, false if rejected.
	 */
	static set(player: Player, key: string, value: unknown): boolean {
		this.ensureInitialized();
		const entry = this.settingsMap.get(key);
		if (!entry) return false;
		const setting = entry.definition;

		const parsed = this.normalizeIncomingValue(setting, value);
		if (parsed === undefined) return false;
		player.setDynamicProperty(this.propertyKey(key), parsed as any);
		return true;
	}

	/** Reset a single setting to its default for a player. */
	static reset(player: Player, key: string): void {
		this.ensureInitialized();
		const entry = this.settingsMap.get(key);
		if (!entry) return;
		player.setDynamicProperty(this.propertyKey(key), entry.definition.default as any);
	}

	/** Reset all settings to defaults for a player. */
	static resetAll(player: Player): void {
		this.ensureInitialized();
		for (const entry of this.settingRegistry) {
			player.setDynamicProperty(this.propertyKey(entry.key), entry.definition.default as any);
		}
	}

	static categories(): WailaSettingCategory[] {
		this.ensureInitialized();
		return this.categoryRegistry
			.slice()
			.sort((a, b) => a.registryOrder - b.registryOrder)
			.map(({ registryOrder: _registryOrder, ...category }) => ({ ...category }));
	}

	static entriesSorted(): [string, WailaSetting][] {
		this.ensureInitialized();
		return this.settingRegistry
			.slice()
			.sort((a, b) => a.registryOrder - b.registryOrder)
			.map((entry) => [entry.key, entry.definition] as [string, WailaSetting]);
	}

	//#region Utils
	private static propertyKey(settingKey: string) {
		return `${this.NAMESPACE}:${settingKey}`;
	}

	public static registerCategory(category: WailaSettingCategory): void {
		this.ensureInitialized();
		this.addCategory(category);
	}

	public static registerSetting(key: string, setting: WailaSetting): void {
		this.ensureInitialized();
		this.addSetting(key, setting);
	}

	private static ensureInitialized(): void {
		if (this.initialized) return;
		this.initialized = true;
		this.seedDefaults();
	}

	private static seedDefaults(): void {
		this.addCategory({
			key: "general",
			labelKey: "waila.settings.category.general",
		});
		this.addCategory({
			key: "displayContent",
			labelKey: "waila.settings.category.displayContent",
		});

		this.addSetting("isEnabled", {
			type: "boolean",
			labelKey: "waila.settings.isEnabled.label",
			category: "general",
			default: true,
		});
		this.addSetting("displayPosition", {
			type: "enum",
			labelKey: "waila.settings.displayPosition.label",
			category: "general",
			default: "top_middle",
			options: this.DISPLAY_POSITION_OPTIONS,
		});
		this.addSetting("displayPositionWhenSneaking", {
			type: "enum",
			labelKey: "waila.settings.displayPositionWhenSneaking.label",
			descriptionKey: "waila.settings.displayPositionWhenSneaking.description",
			category: "general",
			default: "unchanged",
			options: [
				{ value: "unchanged", labelKey: "waila.settings.displayPosition.option.unchanged" },
				...this.DISPLAY_POSITION_OPTIONS
			],
		});
		this.addSetting("blockStatesVisibility", {
			type: "enum",
			labelKey: "waila.settings.blockStatesVisibility.label",
			category: "displayContent",
			default: "when_sneaking",
			options: this.WHEN_TO_SHOW_OPTIONS,
		});
		this.addSetting("effectiveToolVisibility", {
			type: "enum",
			labelKey: "waila.settings.effectiveToolVisibility.label",
			category: "displayContent",
			default: "always",
			options: this.WHEN_TO_SHOW_OPTIONS,
		});
		this.addSetting("containerInventoryVisibility", {
			type: "enum",
			labelKey: "waila.settings.containerInventoryVisibility.label",
			descriptionKey: "waila.settings.containerInventoryVisibility.description",
			category: "displayContent",
			default: "never",
			options: this.WHEN_TO_SHOW_OPTIONS,
			experimental: {
				enabledValues: ["always", "when_not_sneaking", "when_sneaking"],
				confirmTitleKey: "waila.settings.experimental.containerInventory.title",
				confirmBodyKey: "waila.settings.experimental.containerInventory.body",
			},
		});
		this.addSetting("entityTagsVisibility", {
			type: "enum",
			labelKey: "waila.settings.entityTagsVisibility.label",
			category: "displayContent",
			default: "always",
			options: this.WHEN_TO_SHOW_OPTIONS,
		});
		this.addSetting("entityHealthVisibility", {
			type: "enum",
			labelKey: "waila.settings.entityHealthVisibility.label",
			category: "displayContent",
			default: "always",
			options: this.WHEN_TO_SHOW_OPTIONS,
		});
		this.addSetting("alwaysDisplayEntityIntHealth", {
			type: "boolean",
			labelKey: "waila.settings.alwaysDisplayEntityIntHealth.label",
			descriptionKey: "waila.settings.alwaysDisplayEntityIntHealth.description",
			category: "displayContent",
			default: false,
		});
		this.addSetting("entityEffectsVisibility", {
			type: "enum",
			labelKey: "waila.settings.entityEffectsVisibility.label",
			category: "displayContent",
			default: "when_sneaking",
			options: this.WHEN_TO_SHOW_OPTIONS,
		});
		this.addSetting("packAuthorVisibility", {
			type: "enum",
			labelKey: "waila.settings.packAuthorVisibility.label",
			category: "displayContent",
			default: "when_sneaking",
			options: this.WHEN_TO_SHOW_OPTIONS,
		});
	}

	private static addCategory(category: WailaSettingCategory): void {
		const existingIndex = this.categoryRegistry.findIndex((entry) => entry.key === category.key);
		if (existingIndex >= 0) {
			const existing = this.categoryRegistry[existingIndex];
			this.categoryRegistry[existingIndex] = {
				...existing,
				...category,
				registryOrder: existing.registryOrder,
			};
			return;
		}
		this.categoryRegistry.push({ ...category, registryOrder: this.categoryRegistry.length });
	}

	private static addSetting(key: string, setting: WailaSetting): void {
		const existing = this.settingsMap.get(key);
		if (existing) {
			existing.definition = this.cloneSetting(setting);
			return;
		}
		const entry: RegisteredSetting = {
			key,
			definition: this.cloneSetting(setting),
			registryOrder: this.settingRegistry.length,
		};
		this.settingRegistry.push(entry);
		this.settingsMap.set(key, entry);
	}

	private static cloneSetting(setting: WailaSetting): WailaSetting {
		if (setting.type === "enum") {
			const enumSetting = setting as WailaSettingEnum;
			return {
				...enumSetting,
				options: enumSetting.options.map((option) => ({ ...option })),
			};
		}

		return { ...setting } as WailaSetting;
	}

	private static normalizeEnumStoredValue(
		setting: WailaSettingEnum,
		stored: unknown,
	): string | number {
		if (typeof stored === "string") {
			const match = setting.options.find((opt) => opt.value === stored);
			if (match) return match.value;
		}
		if (typeof stored === "number") {
			const directMatch = setting.options.find((opt) => opt.value === stored);
			if (directMatch) return directMatch.value;
			const option = setting.options[stored];
			if (option) return option.value;
		}
		return setting.default;
	}

	static normalizeIncomingValue(
		setting: WailaSetting,
		rawValue: unknown,
	): WailaSettingPrimitive | undefined {
		switch (setting.type) {
			case "boolean":
				return typeof rawValue === "boolean" ? rawValue : undefined;
			case "number":
				return typeof rawValue === "number" ? rawValue : undefined;
			case "string":
				return typeof rawValue === "string" ? rawValue : undefined;
			case "enum": {
				// Accept index, label value, or already normalized value
				if (typeof rawValue === "number") {
					const byIndex = setting.options[rawValue];
					if (byIndex) return byIndex.value;
					const direct = setting.options.find((o) => o.value === rawValue);
					return direct ? direct.value : undefined;
				}
				if (typeof rawValue === "string") {
					const opt = setting.options.find((o) => o.value === rawValue);
					return opt ? opt.value : undefined;
				}
				return undefined;
			}
			default:
				return undefined;
		}
	}

	static isExperimentalEnabled(
		setting: WailaSetting,
		value: WailaSettingPrimitive,
	): boolean {
		if (!setting.experimental) return false;
		return setting.experimental.enabledValues.some((candidate) => candidate === value);
	}
}



//#region Types
/** A setting that represents a boolean value */
interface WailaSettingExperimentalConfig {
	enabledValues: WailaSettingPrimitive[];
	confirmTitleKey: string;
	confirmBodyKey: string;
}

interface WailaSettingBoolean extends WailaSettingBase<boolean> {
	type: "boolean";
}
/** A setting that represents a numeric value */
interface WailaSettingNumber extends WailaSettingBase<number> {
	type: "number";
	range: [number, number];
	step?: number;
}
/** A setting that represents a string value */
interface WailaSettingString extends WailaSettingBase<string> {
	type: "string";
}
/** A setting that represents an enum value */
interface WailaSettingEnum extends WailaSettingBase<string | number> {
	type: "enum";
	options: { labelKey: string; value: string | number }[];
}
/** The base interface for all WAILA settings */
interface WailaSettingBase<TDefault> {
	type: string;
	labelKey: string;
	descriptionKey?: string;
	default: TDefault;
	category?: WailaSettingCategoryKey;
	experimental?: WailaSettingExperimentalConfig;
}
type WailaSetting =
	| WailaSettingBoolean
	| WailaSettingNumber
	| WailaSettingString
	| WailaSettingEnum;

type WailaSettingPrimitive = boolean | number | string;

interface WailaSettingCategory {
	key: WailaSettingCategoryKey;
	labelKey: string;
	descriptionKey?: string;
}

type WailaSettingCategoryKey = string;

interface RegisteredCategory extends WailaSettingCategory {
	registryOrder: number;
}

interface RegisteredSetting {
	key: string;
	definition: WailaSetting;
	registryOrder: number;
}

export type WailaDisplayPosition =
	| "top_left"
	| "top_middle"
	| "top_right"
	| "left_middle"
	| "center"
	| "right_middle"
	| "bottom_left"
	| "bottom_middle"
	| "bottom_right"
	/** The value is the same as the other setting */
	| "unchanged";

export type WailaWhenToShowOption =
	| "always"
	| "when_not_sneaking"
	| "when_sneaking"
	| "never";

export interface WailaSettingsValues {
	isEnabled: boolean;
	displayPosition: WailaDisplayPosition;
	displayPositionWhenSneaking: WailaDisplayPosition;
	blockStatesVisibility: WailaWhenToShowOption;
	effectiveToolVisibility: WailaWhenToShowOption;
	containerInventoryVisibility: WailaWhenToShowOption;
	entityTagsVisibility: WailaWhenToShowOption;
	entityHealthVisibility: WailaWhenToShowOption;
	alwaysDisplayEntityIntHealth: boolean;
	entityEffectsVisibility: WailaWhenToShowOption;
	packAuthorVisibility: WailaWhenToShowOption;
}

export function shouldDisplayFeature(
	option: WailaWhenToShowOption,
	isSneaking: boolean,
): boolean {
	switch (option) {
		case "always":
			return true;
		case "when_not_sneaking":
			return !isSneaking;
		case "when_sneaking":
			return isSneaking;
		case "never":
		default:
			return false;
	}
}

export function resolveDisplayAnchor(
	required: WailaDisplayPosition,
	fallback: WailaDisplayPosition,
): WailaDisplayPosition {
	return required === "unchanged" ? fallback : required;
}
