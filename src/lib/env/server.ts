function requireServerEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing server environment variable: ${name}`);
  }

  return value;
}

function optionalServerEnv(name: string) {
  return process.env[name] ?? "";
}

export const serverEnv = {
  databaseUrl: requireServerEnv("DATABASE_URL"),
  geminiApiKey: optionalServerEnv("GEMINI_API_KEY"),
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
  supabaseServiceRoleKey: optionalServerEnv("SUPABASE_SERVICE_ROLE_KEY"),
};
