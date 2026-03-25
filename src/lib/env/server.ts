function requireServerEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing server environment variable: ${name}`);
  }

  return value;
}

export const serverEnv = {
  databaseUrl: requireServerEnv("DATABASE_URL"),
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
};
