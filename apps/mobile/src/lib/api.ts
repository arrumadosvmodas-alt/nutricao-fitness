export type ApiFood = {
  code?: string;
  name: string;
  brand?: string | null;
  quantity?: string | null;
  serving_size?: string | null;
  calories_kcal_100g: number;
  protein_g_100g: number;
  carbs_g_100g: number;
  fat_g_100g: number;
  source?: string;
};

export type BarcodeFood = ApiFood;

export type FastingGuidance = {
  hydration_between_meals_ml: number;
  break_fast_calories_min: number;
  break_fast_calories_max: number;
  protein_min_g: number;
  fiber_min_g: number;
  allowed_during_fast: string[];
  guidance: string[];
  safety_notes: string[];
};

const apiUrl = process.env.EXPO_PUBLIC_API_URL || "https://nutricao-fitnessweb-production.up.railway.app";

export async function searchFoods(query: string): Promise<ApiFood[]> {
  const response = await fetch(`${apiUrl}/foods/search?q=${encodeURIComponent(query)}&page_size=12`);
  if (!response.ok) throw new Error(`Erro na busca: ${response.status}`);
  const data = await response.json();
  return data.items ?? [];
}

export async function findFoodByBarcode(code: string): Promise<BarcodeFood | null> {
  const response = await fetch(`${apiUrl}/foods/barcode/${encodeURIComponent(code)}`);
  if (!response.ok) return null;
  const data = await response.json();
  return data.item ?? data;
}

export async function getFastingGuidance(payload: {
  protocol: "12:12" | "14:10" | "16:8" | "18:6";
  weight_kg: number;
  calorie_target: number;
  context: "normal" | "training" | "hot_day";
}): Promise<FastingGuidance | null> {
  const response = await fetch(`${apiUrl}/fasting/guidance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      protocol: payload.protocol,
      body_weight_kg: payload.weight_kg,
      daily_calorie_target: payload.calorie_target,
      activity_context: payload.context === "normal" ? "work" : payload.context
    })
  });
  if (!response.ok) return null;
  return response.json();
}
