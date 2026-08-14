function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function getAppBaseUrl(): string {
  const configuredBaseUrl = process.env.APP_BASE_URL || process.env.APP_URL;
  if (configuredBaseUrl) {
    return trimTrailingSlash(configuredBaseUrl);
  }

  if (process.env.NODE_ENV !== "production") {
    const port = process.env.PORT || "5000";
    return `http://localhost:${port}`;
  }

  return "https://tidum.no";
}

export function getGoogleCallbackUrl(): string {
  return `${getAppBaseUrl()}/api/auth/google/callback`;
}
