const REPORT_TEMPLATE_UPDATABLE_FIELD_NAMES = [
  "name",
  "description",
  "template_type",
  "privacy_notice_enabled",
  "privacy_notice_text",
  "paper_size",
  "orientation",
  "margin_top",
  "margin_bottom",
  "margin_left",
  "margin_right",
  "header_enabled",
  "header_height",
  "header_logo_url",
  "header_logo_position",
  "header_title",
  "header_subtitle",
  "header_show_date",
  "header_show_page_numbers",
  "footer_enabled",
  "footer_height",
  "footer_text",
  "footer_show_page_numbers",
  "primary_color",
  "secondary_color",
  "font_family",
  "font_size",
  "line_height",
  "blocks",
  "is_default",
  "is_active",
] as const;

export const REPORT_TEMPLATE_UPDATABLE_FIELDS = new Set<string>(
  REPORT_TEMPLATE_UPDATABLE_FIELD_NAMES,
);

// The current CMS client includes id in an update payload. These metadata
// fields are safe to ignore, but must never become SQL identifiers.
const REPORT_TEMPLATE_IGNORED_FIELDS = new Set([
  "id",
  "created_at",
  "updated_at",
]);

export type ReportTemplateUpdateSelection = {
  fields: string[];
  rejectedFields: string[];
};

/**
 * Select the only request-body keys that may become identifiers in the
 * legacy report-template UPDATE statement. Tenant/ownership fields
 * (vendor_id, company_id and created_by) are deliberately immutable here.
 */
export function selectReportTemplateUpdateFields(
  value: unknown,
): ReportTemplateUpdateSelection {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { fields: [], rejectedFields: [] };
  }

  const keys = Object.keys(value);
  return {
    fields: keys.filter((key) => REPORT_TEMPLATE_UPDATABLE_FIELDS.has(key)),
    rejectedFields: keys.filter(
      (key) =>
        !REPORT_TEMPLATE_UPDATABLE_FIELDS.has(key) &&
        !REPORT_TEMPLATE_IGNORED_FIELDS.has(key),
    ),
  };
}
