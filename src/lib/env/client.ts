function requirePublicEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing public environment variable: ${name}`);
  }

  return value;
}

export const publicEnv = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  supabaseAnonKey: requirePublicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseUrl: requirePublicEnv("NEXT_PUBLIC_SUPABASE_URL"),
};
