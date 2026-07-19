export type BarcodeFood = {
  code?: string;
  name: string;
  brand?: string | null;
  quantity?: string | null;
  serving_size?: string | null;
  calories_kcal_100g: number;
  protein_g_100g: number;
  carbs_g_100g: number;
  fat_g_100g: number;
};

const apiUrl = process.env.EXPO_PUBLIC_API_URL || "https://nutricao-fitnessweb-production.up.railway.app";

export async function findFoodByBarcode(code: string): Promise<BarcodeFood | null> {
  const response = await fetch(`${apiUrl}/foods/barcode/${encodeURIComponent(code)}`);
  if (!response.ok) return null;
  const data = await response.json();
  return data.item ?? data;
}

