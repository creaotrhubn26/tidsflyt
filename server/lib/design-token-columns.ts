/**
 * server/lib/design-token-columns.ts
 *
 * Whitelist av kolonnenavn som kan bli SQL-identifikatorer i de dynamiske
 * design_tokens-/section_design_settings-oppdateringene (CMS). Uten dette
 * bygde flere ruter SET-klausulen fra Object.keys(...) av lagret JSON med
 * kun blocklist — samme injectionklasse som PUT /api/report-templates/:id
 * (fikset tidligere). id/updated_at/is_active/section_name er bevisst
 * ikke oppdaterbare her.
 */
export const DESIGN_TOKEN_COLUMNS = new Set<string>([
  "primary_color", "primary_color_light", "primary_color_dark", "secondary_color",
  "accent_color", "background_color", "background_color_dark", "surface_color",
  "surface_color_dark", "text_color", "text_color_dark", "muted_color", "border_color",
  "font_family", "font_family_heading", "font_size_base", "font_size_scale",
  "line_height_base", "line_height_heading", "font_weight_normal", "font_weight_medium",
  "font_weight_bold", "letter_spacing", "letter_spacing_heading", "spacing_unit",
  "spacing_xs", "spacing_sm", "spacing_md", "spacing_lg", "spacing_xl",
  "border_radius_none", "border_radius_sm", "border_radius_md", "border_radius_lg",
  "border_radius_xl", "border_radius_full", "border_width", "shadow_none", "shadow_sm",
  "shadow_md", "shadow_lg", "shadow_xl", "animation_duration", "animation_duration_slow",
  "animation_duration_fast", "animation_easing", "enable_animations", "enable_hover_effects",
  "container_max_width", "container_padding",
]);

export const SECTION_DESIGN_COLUMNS = new Set<string>([
  "layout", "content_max_width", "padding_top", "padding_bottom", "padding_x", "gap",
  "background_color", "background_gradient", "background_image", "background_overlay_color",
  "background_overlay_opacity", "background_blur", "background_parallax", "heading_size",
  "heading_weight", "heading_color", "text_size", "text_color", "grid_columns",
  "grid_columns_tablet", "grid_columns_mobile", "grid_gap", "card_style", "card_padding",
  "card_radius", "card_shadow", "card_background", "card_border_color", "card_hover_effect",
  "icon_style", "icon_size", "icon_color", "icon_background", "button_variant", "button_size",
  "button_radius", "animation_type", "animation_delay", "animation_stagger", "hero_height",
  "hero_video_url", "hero_video_autoplay", "hero_video_loop", "hero_video_muted",
  "testimonial_layout", "testimonial_avatar_size", "testimonial_avatar_shape",
  "testimonial_quote_style", "footer_columns", "footer_divider", "footer_divider_color",
]);

/** camelCase → snake_case, som page-version-restore forventer. */
export function snake(key: string): string {
  return key.replace(/([A-Z])/g, "_$1").toLowerCase();
}

/** Behold kun nøkler som er trygge identifikatorer i den gitte tabellen. */
export function safeColumns(keys: string[], tillatt: Set<string>): string[] {
  return keys.filter((k) => tillatt.has(k));
}
