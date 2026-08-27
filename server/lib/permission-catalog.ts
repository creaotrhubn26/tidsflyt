export const PERMISSION_CATALOG = [
  { key: "vendor.create", label: "Opprette leverandør", module: "leverandorer" },
  { key: "vendor.admin.create", label: "Opprette leverandøradmin", module: "leverandorer" },
  { key: "vendor.poweroffice_visibility.toggle", label: "Skjule/vise PowerOffice for leverandør", module: "leverandorer" },
  { key: "prototype_tester.invite", label: "Invitere prototype-tester", module: "prototype_testere" },
  { key: "prototype_tester.convert", label: "Konvertere tester til leverandøradmin", module: "prototype_testere" },
  { key: "user.expected_ssn.set", label: "Forhåndsregistrere fødselsnummer på konto", module: "eid" },
  { key: "role.manage", label: "Administrere roller og tillatelser", module: "systemadministrasjon" },
  { key: "activity_log.view", label: "Se aktivitetslogg", module: "systemadministrasjon" },
  { key: "cms.manage", label: "Administrere globalt CMS", module: "systemadministrasjon" },
] as const;

export type PermissionKey = typeof PERMISSION_CATALOG[number]["key"];

export const VENDOR_ADMIN_PERMISSION_KEYS: PermissionKey[] = [
  "vendor.poweroffice_visibility.toggle",
];
