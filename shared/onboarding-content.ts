export type OnboardingRoleKey = "tiltaksleder" | "miljoarbeider";

export type OnboardingTaskGroup = "profil" | "oppsett" | "arbeidsflyt";

export interface OnboardingTaskTemplate {
  id: string;
  title: string;
  description: string;
  required: boolean;
  enabled?: boolean;
  actionPath: string | null;
  actionLabel: string | null;
  group: OnboardingTaskGroup;
}

export interface OnboardingRoleContent {
  step0Title: string;
  step0Description: string;
  step1Title: string;
  step1Description: string;
  step2Title: string;
  step2Description: string;
  welcomeMessage: string;
  completionHint: string;
  tasks: OnboardingTaskTemplate[];
}

export interface OnboardingContentTemplate {
  roles: Record<OnboardingRoleKey, OnboardingRoleContent>;
}

export const DEFAULT_ONBOARDING_CONTENT: OnboardingContentTemplate = {
  roles: {
    tiltaksleder: {
      step0Title: "Velkommen til Tidum",
      step0Description: "Få virksomheten klar for timeføring, rapportering og oppfølging.",
      step1Title: "Sett opp virksomheten",
      step1Description: "Inviter teamet, opprett saker og konfigurer satser før oppstart.",
      step2Title: "Kom i gang med drift",
      step2Description: "Følg opp første timeliste og sørg for at arbeidsflyten fungerer.",
      welcomeMessage: "Tidum hjelper deg med å få struktur på timer, saker og godkjenninger fra første dag.",
      completionHint: "Fullfør de obligatoriske punktene for å aktivere arbeidsflyten for teamet ditt.",
      tasks: [
        {
          id: "profile_confirmed",
          title: "Bekreft profil",
          description: "Bekreft at virksomhetsinformasjon og kontaktdata er korrekt.",
          required: true,
          actionPath: "/profile",
          actionLabel: "Åpne profil",
          group: "profil",
        },
        {
          id: "guide_viewed",
          title: "Se Get Started-guide",
          description: "Gå gjennom rolleflyten for tiltaksleder før oppstart.",
          required: true,
          actionPath: "/guide",
          actionLabel: "Åpne guide",
          group: "profil",
        },
        {
          id: "invite_worker",
          title: "Inviter miljøarbeider",
          description: "Inviter minst én miljøarbeider til virksomheten.",
          required: true,
          actionPath: "/invites",
          actionLabel: "Inviter nå",
          group: "oppsett",
        },
        {
          id: "create_case",
          title: "Opprett eller tildel sak",
          description: "Sørg for at minst én sak er opprettet i portalen.",
          required: true,
          actionPath: "/cases",
          actionLabel: "Gå til saker",
          group: "oppsett",
        },
        {
          id: "configure_compensation",
          title: "Sett timesats/utgift per sak",
          description: "Konfigurer timesats og eventuelt utgiftspost på minst én sak.",
          required: true,
          actionPath: "/invites",
          actionLabel: "Konfigurer sats",
          group: "oppsett",
        },
        {
          id: "logo_uploaded",
          title: "Legg til firmalogo (valgfritt)",
          description: "Logo brukes i rapporter og PDF-er.",
          required: false,
          actionPath: "/profile",
          actionLabel: "Legg til logo",
          group: "profil",
        },
        {
          id: "approve_timesheet",
          title: "Godkjenn første timeliste (valgfritt)",
          description: "Når første innsending kommer inn, godkjenn den for å fullføre flyten.",
          required: false,
          actionPath: "/timesheets",
          actionLabel: "Åpne timelister",
          group: "arbeidsflyt",
        },
      ],
    },
    miljoarbeider: {
      step0Title: "Velkommen til Tidum",
      step0Description: "Få kontroll på timeføring, saker og rapporter fra første dag.",
      step1Title: "Bli klar til føring",
      step1Description: "Bekreft profilen din og sikre at du har riktig sakstilknytning.",
      step2Title: "Send første leveranse",
      step2Description: "Registrer timer, send timeliste og opprett første saksrapport.",
      welcomeMessage: "Tidum gjør det enklere å registrere arbeid, følge opp saker og sende inn riktig dokumentasjon.",
      completionHint: "Fullfør de obligatoriske punktene for å låse opp hele arbeidsflyten.",
      tasks: [
        {
          id: "profile_confirmed",
          title: "Bekreft profil",
          description: "Bekreft at kontaktopplysninger og språkvalg stemmer.",
          required: true,
          actionPath: "/profile",
          actionLabel: "Åpne profil",
          group: "profil",
        },
        {
          id: "guide_viewed",
          title: "Se Get Started-guide",
          description: "Gå gjennom onboarding for miljøarbeider før føring.",
          required: true,
          actionPath: "/guide",
          actionLabel: "Åpne guide",
          group: "profil",
        },
        {
          id: "assigned_case",
          title: "Sikre tildelt sak",
          description: "Du må ha minst én sak tildelt av tiltaksleder.",
          required: true,
          actionPath: "/time-tracking",
          actionLabel: "Gå til timeføring",
          group: "oppsett",
        },
        {
          id: "first_time_entry",
          title: "Registrer første timer",
          description: "Før første arbeidsøkt i den nye timerseksjonen.",
          required: true,
          actionPath: "/time-tracking",
          actionLabel: "Registrer tid",
          group: "arbeidsflyt",
        },
        {
          id: "submit_timesheet",
          title: "Send første timeliste",
          description: "Send månedens timeliste til tiltaksleder for godkjenning.",
          required: true,
          actionPath: "/timesheets",
          actionLabel: "Åpne timelister",
          group: "arbeidsflyt",
        },
        {
          id: "submit_case_report",
          title: "Send første saksrapport",
          description: "Opprett og send inn en saksrapport i rapportflyten.",
          required: true,
          actionPath: "/case-reports",
          actionLabel: "Åpne saksrapporter",
          group: "arbeidsflyt",
        },
      ],
    },
  },
};

function sanitizeTask(task: unknown, fallback: OnboardingTaskTemplate): OnboardingTaskTemplate {
  if (!task || typeof task !== "object" || Array.isArray(task)) {
    return fallback;
  }

  const candidate = task as Record<string, unknown>;
  return {
    id: typeof candidate.id === "string" && candidate.id.trim() ? candidate.id.trim() : fallback.id,
    title: typeof candidate.title === "string" && candidate.title.trim() ? candidate.title.trim() : fallback.title,
    description:
      typeof candidate.description === "string" && candidate.description.trim()
        ? candidate.description.trim()
        : fallback.description,
    required: typeof candidate.required === "boolean" ? candidate.required : fallback.required,
    enabled: typeof candidate.enabled === "boolean" ? candidate.enabled : fallback.enabled,
    actionPath: typeof candidate.actionPath === "string" ? candidate.actionPath : fallback.actionPath,
    actionLabel: typeof candidate.actionLabel === "string" ? candidate.actionLabel : fallback.actionLabel,
    group:
      candidate.group === "profil" || candidate.group === "oppsett" || candidate.group === "arbeidsflyt"
        ? candidate.group
        : fallback.group,
  };
}

function sanitizeRoleContent(role: unknown, fallback: OnboardingRoleContent): OnboardingRoleContent {
  if (!role || typeof role !== "object" || Array.isArray(role)) {
    return fallback;
  }

  const candidate = role as Record<string, unknown>;
  const fallbackTaskMap = new Map(fallback.tasks.map((task) => [task.id, task] as const));
  const providedTasks = Array.isArray(candidate.tasks) ? candidate.tasks : [];

  const tasks = providedTasks.length > 0
    ? providedTasks.map((task) => {
        const taskId = typeof (task as Record<string, unknown>)?.id === "string"
          ? ((task as Record<string, unknown>).id as string)
          : "";
        return sanitizeTask(task, fallbackTaskMap.get(taskId) || fallback.tasks[0]);
      })
    : fallback.tasks;

  return {
    step0Title: typeof candidate.step0Title === "string" && candidate.step0Title.trim() ? candidate.step0Title.trim() : fallback.step0Title,
    step0Description:
      typeof candidate.step0Description === "string" && candidate.step0Description.trim()
        ? candidate.step0Description.trim()
        : fallback.step0Description,
    step1Title: typeof candidate.step1Title === "string" && candidate.step1Title.trim() ? candidate.step1Title.trim() : fallback.step1Title,
    step1Description:
      typeof candidate.step1Description === "string" && candidate.step1Description.trim()
        ? candidate.step1Description.trim()
        : fallback.step1Description,
    step2Title: typeof candidate.step2Title === "string" && candidate.step2Title.trim() ? candidate.step2Title.trim() : fallback.step2Title,
    step2Description:
      typeof candidate.step2Description === "string" && candidate.step2Description.trim()
        ? candidate.step2Description.trim()
        : fallback.step2Description,
    welcomeMessage:
      typeof candidate.welcomeMessage === "string" && candidate.welcomeMessage.trim()
        ? candidate.welcomeMessage.trim()
        : fallback.welcomeMessage,
    completionHint:
      typeof candidate.completionHint === "string" && candidate.completionHint.trim()
        ? candidate.completionHint.trim()
        : fallback.completionHint,
    tasks,
  };
}

export function normalizeOnboardingContent(input: unknown): OnboardingContentTemplate {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return DEFAULT_ONBOARDING_CONTENT;
  }

  const candidate = input as Record<string, unknown>;
  const roles = candidate.roles && typeof candidate.roles === "object" && !Array.isArray(candidate.roles)
    ? (candidate.roles as Record<string, unknown>)
    : {};

  return {
    roles: {
      tiltaksleder: sanitizeRoleContent(roles.tiltaksleder, DEFAULT_ONBOARDING_CONTENT.roles.tiltaksleder),
      miljoarbeider: sanitizeRoleContent(roles.miljoarbeider, DEFAULT_ONBOARDING_CONTENT.roles.miljoarbeider),
    },
  };
}
