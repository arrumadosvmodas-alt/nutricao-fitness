from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Nutricao & Fitness API"
    supabase_url: str | None = None
    supabase_service_role_key: str | None = None
    redis_url: str | None = None
    mercado_pago_access_token: str | None = None
    app_web_url: str = "https://nutricao-fitness-web.vercel.app"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()

