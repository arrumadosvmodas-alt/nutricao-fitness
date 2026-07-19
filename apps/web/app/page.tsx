"use client";

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import {
  Apple,
  BarChart3,
  Clock3,
  Droplets,
  Dumbbell,
  LogOut,
  Plus,
  RotateCcw,
  Scale,
  Search,
  Trash2,
  UserCog,
  Utensils
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Meal = "breakfast" | "lunch" | "dinner" | "snack";
type Context = "work" | "training" | "hot_day" | "rest";
type Protocol = "12:12" | "14:10" | "16:8" | "18:6";

type FoodEntry = {
  id: string;
  meal: Meal;
  name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

type WaterEntry = { id: string; amountMl: number };
type ExerciseEntry = { id: string; name: string; minutes: number; calories: number };
type WeightEntry = { id: string; weightKg: number; date: string };
type FoodSource = "open_food_facts" | "base_comum" | "user" | "supabase";
type FoodOption = { id: string; name: string; brand: string | null; calories: number; protein: number; carbs: number; fat: number; unit: string; per100g?: boolean; source?: FoodSource };
type ExternalFood = { code?: string; name: string; brand?: string | null; calories_kcal_100g: number; protein_g_100g: number; carbs_g_100g: number; fat_g_100g: number; source?: FoodSource };
type GoalTargets = { calories: number; protein: number; carbs: number; fat: number };
type FastingGuidance = { fastingHours: number; eatingWindowHours: number; nextMeal: string; hydration: number; minKcal: number; maxKcal: number; protein: number; fiber: number };
type OnboardingForm = {
  fullName: string;
  birthDate: string;
  sex: "male" | "female";
  heightCm: string;
  currentWeightKg: string;
  targetWeightKg: string;
  activityLevel: "sedentary" | "light" | "moderate" | "active" | "very_active";
  goal: "lose" | "maintain" | "gain";
};

type FastingPlan = {
  id?: string;
  protocol: Protocol;
  lastMeal: string;
  weightKg: number;
  calorieTarget: number;
  context: Context;
};

type AppState = {
  calorieTarget: number;
  foodEntries: FoodEntry[];
  waterEntries: WaterEntry[];
  exerciseEntries: ExerciseEntry[];
  weightEntries: WeightEntry[];
  fastingPlan: FastingPlan;
};

const today = new Date().toISOString().slice(0, 10);
const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const mealLabels: Record<Meal, string> = {
  breakfast: "Café da manhã",
  lunch: "Almoço",
  dinner: "Jantar",
  snack: "Lanche"
};

function foodSourceLabel(source?: FoodSource) {
  if (source === "base_comum") return "Base comum";
  if (source === "open_food_facts") return "Open Food Facts";
  if (source === "user") return "Salvo por você";
  return "Base Supabase";
}

const activityFactors = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9
} as const;

const goalAdjustments = {
  lose: -400,
  maintain: 0,
  gain: 300
} as const;

const defaultTargets: GoalTargets = { calories: 2100, protein: 126, carbs: 240, fat: 58 };

const protocolHours: Record<Protocol, readonly [number, number]> = {
  "12:12": [12, 12],
  "14:10": [14, 10],
  "16:8": [16, 8],
  "18:6": [18, 6]
};

const defaultState: AppState = {
  calorieTarget: 2100,
  foodEntries: [],
  waterEntries: [],
  exerciseEntries: [],
  weightEntries: [],
  fastingPlan: {
    protocol: "16:8",
    lastMeal: "20:00",
    weightKg: 80,
    calorieTarget: 2100,
    context: "work"
  }
};

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function addHours(time: string, hours: number) {
  const [hour, minute] = time.split(":").map(Number);
  const total = hour * 60 + minute + hours * 60;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function calculateAge(birthDate: string) {
  const birth = new Date(`${birthDate}T00:00:00`);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age;
}

function calculateTargets(form: OnboardingForm): GoalTargets {
  const weight = Number(form.currentWeightKg);
  const height = Number(form.heightCm);
  const age = calculateAge(form.birthDate);
  const bmrBase = 10 * weight + 6.25 * height - 5 * age;
  const bmr = form.sex === "male" ? bmrBase + 5 : bmrBase - 161;
  const tdee = bmr * activityFactors[form.activityLevel];
  const calories = Math.max(1200, Math.round(tdee + goalAdjustments[form.goal]));
  const protein = Math.round(weight * 1.8);
  const fat = Math.round((calories * 0.25) / 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  return { calories, protein, carbs, fat };
}

function isOnboardingComplete(profile: unknown) {
  const item = profile as { birth_date?: string | null; sex?: string | null; height_cm?: number | null; current_weight_kg?: number | null; target_weight_kg?: number | null } | null;
  return Boolean(item?.birth_date && item?.sex && item?.height_cm && item?.current_weight_kg && item?.target_weight_kg);
}

function getLocalFastingGuidance(plan: FastingPlan): FastingGuidance {
  const [fastingHours, eatingWindowHours] = protocolHours[plan.protocol];
  const contextBonus = plan.context === "training" ? 500 : plan.context === "hot_day" ? 350 : 0;
  const hydration = Math.max(500, Math.round(((plan.weightKg * 35 + contextBonus) * fastingHours) / 24));
  const minKcal = Math.max(250, Math.round(plan.calorieTarget * 0.22));
  const maxKcal = Math.max(minKcal, Math.round(plan.calorieTarget * 0.32));
  const protein = Math.max(20, Math.round(plan.weightKg * 0.35));
  return { fastingHours, eatingWindowHours, nextMeal: addHours(plan.lastMeal, fastingHours), hydration, minKcal, maxKcal, protein, fiber: 8 };
}


async function calculateTargetsWithApi(form: OnboardingForm): Promise<GoalTargets> {
  try {
    const response = await fetch(`${apiUrl}/goals/calculate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sex: form.sex,
        weight_kg: Number(form.currentWeightKg),
        height_cm: Number(form.heightCm),
        age_years: calculateAge(form.birthDate),
        activity_level: form.activityLevel,
        goal: form.goal
      })
    });
    if (!response.ok) throw new Error("API indisponivel");
    const data = await response.json();
    return {
      calories: Math.round(Number(data.calories_kcal)),
      protein: Math.round(Number(data.protein_g)),
      carbs: Math.round(Number(data.carbs_g)),
      fat: Math.round(Number(data.fat_g))
    };
  } catch {
    return calculateTargets(form);
  }
}

async function getFastingGuidanceWithApi(plan: FastingPlan): Promise<FastingGuidance> {
  try {
    const response = await fetch(`${apiUrl}/fasting/guidance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        protocol: plan.protocol,
        body_weight_kg: plan.weightKg,
        daily_calorie_target: plan.calorieTarget,
        activity_context: plan.context
      })
    });
    if (!response.ok) throw new Error("API indisponivel");
    const data = await response.json();
    return {
      fastingHours: data.fasting_hours,
      eatingWindowHours: data.eating_window_hours,
      nextMeal: addHours(plan.lastMeal, data.fasting_hours),
      hydration: data.hydration_between_meals_ml,
      minKcal: data.break_fast_calories_min,
      maxKcal: data.break_fast_calories_max,
      protein: data.protein_min_g,
      fiber: data.fiber_min_g
    };
  } catch {
    return getLocalFastingGuidance(plan);
  }
}
async function ensureProfile(supabase: SupabaseClient, session: Session) {
  await supabase.from("profiles").upsert({
    id: session.user.id,
    full_name: session.user.email?.split("@")[0] ?? "Usuário",
    activity_level: "light",
    goal: "maintain",
    timezone: "America/Fortaleza"
  });
}

export default function Home() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [selectedDate, setSelectedDate] = useState(today);
  const [state, setState] = useState<AppState>(defaultState);
  const [ready, setReady] = useState(false);
  const [loadingRemote, setLoadingRemote] = useState(false);
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [authForm, setAuthForm] = useState({ email: "", password: "" });
  const [foodOptions, setFoodOptions] = useState<FoodOption[]>([]);
  const [externalFoodQuery, setExternalFoodQuery] = useState("");
  const [externalFoods, setExternalFoods] = useState<ExternalFood[]>([]);
  const [selectedPer100gFood, setSelectedPer100gFood] = useState<FoodOption | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [goalTargets, setGoalTargets] = useState<GoalTargets>(defaultTargets);
  const [fastingGuidance, setFastingGuidance] = useState<FastingGuidance>(getLocalFastingGuidance(defaultState.fastingPlan));
  const [onboardingForm, setOnboardingForm] = useState<OnboardingForm>({
    fullName: "",
    birthDate: "1990-01-01",
    sex: "male",
    heightCm: "175",
    currentWeightKg: "80",
    targetWeightKg: "78",
    activityLevel: "light",
    goal: "maintain"
  });

  const [foodForm, setFoodForm] = useState({ meal: "lunch" as Meal, name: "", quantity: "1", unit: "porção", calories: "", protein: "", carbs: "", fat: "" });
  const [waterAmount, setWaterAmount] = useState("250");
  const [exerciseForm, setExerciseForm] = useState({ name: "", minutes: "30", calories: "" });
  const [weightForm, setWeightForm] = useState("");

  useEffect(() => {
    if (!supabase) {
      const stored = window.localStorage.getItem("nutricao-fitness-state");
      if (stored) setState({ ...defaultState, ...JSON.parse(stored) });
      setReady(true);
      return;
    }

    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, currentSession) => setSession(currentSession));
    setReady(true);
    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (ready && !session) {
      window.localStorage.setItem("nutricao-fitness-state", JSON.stringify(state));
    }
  }, [ready, session, state]);

  useEffect(() => {
    if (!supabase || !session) return;
    void loadRemoteData();
  }, [supabase, session, selectedDate]);

  async function loadRemoteData() {
    if (!supabase || !session) return;
    setLoadingRemote(true);
    setMessage("Sincronizando com Supabase...");
    await ensureProfile(supabase, session);

    const [profile, foods, diary, water, exercise, weight, goals, fasting] = await Promise.all([
      supabase.from("profiles").select("full_name,birth_date,sex,height_cm,current_weight_kg,target_weight_kg,activity_level,goal").eq("id", session.user.id).maybeSingle(),
      supabase.from("foods").select("id,name,brand,source,calories_kcal,protein_g,carbs_g,fat_g,serving_unit,serving_size").order("name").limit(25),
      supabase.from("diary_entries").select("id,meal,food_name_snapshot,quantity,unit,calories_kcal,protein_g,carbs_g,fat_g").eq("diary_date", selectedDate).order("created_at"),
      supabase.from("water_entries").select("id,amount_ml").eq("diary_date", selectedDate).order("created_at"),
      supabase.from("exercise_entries").select("id,name,duration_minutes,calories_kcal").eq("diary_date", selectedDate).order("created_at"),
      supabase.from("weight_entries").select("id,weight_kg,measured_on").order("measured_on", { ascending: true }).limit(30),
      supabase.from("nutrition_goals").select("calories_kcal,protein_g,carbs_g,fat_g").order("created_at", { ascending: false }).limit(1),
      supabase.from("fasting_plans").select("id,protocol,last_meal_time,next_meal_time,hydration_target_ml,break_fast_min_kcal,break_fast_max_kcal,protein_min_g,active").eq("active", true).order("created_at", { ascending: false }).limit(1)
    ]);

    const profileData = profile.data;
    if (profileData) {
      setNeedsOnboarding(!isOnboardingComplete(profileData));
      setOnboardingForm((current) => ({
        ...current,
        fullName: profileData.full_name ?? current.fullName,
        birthDate: profileData.birth_date ?? current.birthDate,
        sex: (profileData.sex as "male" | "female") ?? current.sex,
        heightCm: profileData.height_cm ? String(profileData.height_cm) : current.heightCm,
        currentWeightKg: profileData.current_weight_kg ? String(profileData.current_weight_kg) : current.currentWeightKg,
        targetWeightKg: profileData.target_weight_kg ? String(profileData.target_weight_kg) : current.targetWeightKg,
        activityLevel: (profileData.activity_level as OnboardingForm["activityLevel"]) ?? current.activityLevel,
        goal: (profileData.goal as OnboardingForm["goal"]) ?? current.goal
      }));
    } else {
      setNeedsOnboarding(true);
    }

    if (foods.data) {
      setFoodOptions(foods.data.map((item) => ({
        id: item.id,
        name: item.name,
        brand: item.brand,
        calories: Number(item.calories_kcal),
        protein: Number(item.protein_g),
        carbs: Number(item.carbs_g),
        fat: Number(item.fat_g),
        unit: item.serving_unit,
        source: (item.source as FoodSource) ?? "supabase",
        per100g: item.serving_unit === "g" && Number(item.serving_size ?? 100) === 100
      })));
    }

    setState((current) => ({
      ...current,
      calorieTarget: goals.data?.[0]?.calories_kcal ? Number(goals.data[0].calories_kcal) : current.calorieTarget,
      foodEntries: diary.data?.map((entry) => ({
        id: entry.id,
        meal: entry.meal as Meal,
        name: entry.food_name_snapshot,
        quantity: Number(entry.quantity),
        unit: entry.unit,
        calories: Number(entry.calories_kcal),
        protein: Number(entry.protein_g),
        carbs: Number(entry.carbs_g),
        fat: Number(entry.fat_g)
      })) ?? [],
      waterEntries: water.data?.map((entry) => ({ id: entry.id, amountMl: entry.amount_ml })) ?? [],
      exerciseEntries: exercise.data?.map((entry) => ({ id: entry.id, name: entry.name, minutes: entry.duration_minutes ?? 0, calories: Number(entry.calories_kcal ?? 0) })) ?? [],
      weightEntries: weight.data?.map((entry) => ({ id: entry.id, weightKg: Number(entry.weight_kg), date: entry.measured_on })) ?? [],
      fastingPlan: fasting.data?.[0] ? {
        ...current.fastingPlan,
        id: fasting.data[0].id,
        protocol: fasting.data[0].protocol as Protocol,
        lastMeal: String(fasting.data[0].last_meal_time).slice(0, 5)
      } : current.fastingPlan
    }));

    if (goals.data?.[0]) {
      setGoalTargets({
        calories: Number(goals.data[0].calories_kcal),
        protein: Number(goals.data[0].protein_g ?? defaultTargets.protein),
        carbs: Number(goals.data[0].carbs_g ?? defaultTargets.carbs),
        fat: Number(goals.data[0].fat_g ?? defaultTargets.fat)
      });
    }
    setMessage("Dados sincronizados.");
    setLoadingRemote(false);
  }

  const totals = useMemo(() => {
    const consumed = state.foodEntries.reduce((sum, entry) => sum + entry.calories, 0);
    const protein = state.foodEntries.reduce((sum, entry) => sum + entry.protein, 0);
    const carbs = state.foodEntries.reduce((sum, entry) => sum + entry.carbs, 0);
    const fat = state.foodEntries.reduce((sum, entry) => sum + entry.fat, 0);
    const water = state.waterEntries.reduce((sum, entry) => sum + entry.amountMl, 0);
    const exercise = state.exerciseEntries.reduce((sum, entry) => sum + entry.calories, 0);
    return { consumed, protein, carbs, fat, water, exercise };
  }, [state]);
  const remaining = state.calorieTarget - totals.consumed + totals.exercise;
  const isCloud = Boolean(supabase && session);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      setMessage("Configure .env.local para ativar login com Supabase.");
      return;
    }
    const action = mode === "login" ? supabase.auth.signInWithPassword(authForm) : supabase.auth.signUp(authForm);
    const { data, error } = await action;
    if (error) setMessage(error.message);
    else {
      if (data.session) await ensureProfile(supabase, data.session);
      setMessage(mode === "signup" ? "Cadastro criado. Se a confirmação de e-mail estiver ativa, confirme antes de entrar." : "Login realizado.");
    }
  }

  function applyPer100gFood(food: FoodOption, grams: number) {
    const factor = (Number(grams) || 0) / 100;
    setFoodForm((current) => ({
      ...current,
      name: food.name,
      quantity: String(grams || 100),
      unit: "g",
      calories: String(Math.round(food.calories * factor)),
      protein: String(Math.round(food.protein * factor * 10) / 10),
      carbs: String(Math.round(food.carbs * factor * 10) / 10),
      fat: String(Math.round(food.fat * factor * 10) / 10)
    }));
  }

  async function searchExternalFoods(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!externalFoodQuery.trim()) return;
    try {
      const response = await fetch(`${apiUrl}/foods/search?q=${encodeURIComponent(externalFoodQuery.trim())}&page_size=10`);
      if (!response.ok) throw new Error("Busca indisponível");
      const data = await response.json();
      setExternalFoods(data.items ?? []);
      setMessage(`Encontrados ${(data.items ?? []).length} alimentos na base ampliada.`);
    } catch {
      setMessage("A busca da base ampliada ainda não está disponível na API publicada. Aguarde o deploy da Railway e tente novamente.");
    }
  }

  function chooseExternalFood(food: ExternalFood) {
    const option: FoodOption = {
      id: food.code || createId("external"),
      name: food.brand ? `${food.name} - ${food.brand}` : food.name,
      brand: food.brand ?? null,
      calories: Number(food.calories_kcal_100g) || 0,
      protein: Number(food.protein_g_100g) || 0,
      carbs: Number(food.carbs_g_100g) || 0,
      fat: Number(food.fat_g_100g) || 0,
      unit: "g",
      source: food.source ?? "open_food_facts",
      per100g: true
    };
    setSelectedPer100gFood(option);
    applyPer100gFood(option, 100);
  }

  function chooseFoodOption(id: string) {
    const selected = foodOptions.find((item) => item.id === id);
    if (!selected) return;
    setSelectedPer100gFood(selected.per100g ? selected : null);
    if (selected.per100g) {
      applyPer100gFood(selected, 100);
      return;
    }
    setFoodForm((current) => ({ ...current, name: selected.name, unit: selected.unit, calories: String(selected.calories), protein: String(selected.protein), carbs: String(selected.carbs), fat: String(selected.fat) }));
  }

  async function submitOnboarding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isCloud) {
      setMessage("Entre com uma conta para salvar o perfil no Supabase.");
      return;
    }

    const targets = await calculateTargetsWithApi(onboardingForm);
    const { error: profileError } = await supabase!.from("profiles").upsert({
      id: session!.user.id,
      full_name: onboardingForm.fullName.trim() || session!.user.email?.split("@")[0] || "Usuário",
      birth_date: onboardingForm.birthDate,
      sex: onboardingForm.sex,
      height_cm: Number(onboardingForm.heightCm),
      current_weight_kg: Number(onboardingForm.currentWeightKg),
      target_weight_kg: Number(onboardingForm.targetWeightKg),
      activity_level: onboardingForm.activityLevel,
      goal: onboardingForm.goal,
      timezone: "America/Fortaleza"
    });
    if (profileError) return setMessage(profileError.message);

    const { error: goalError } = await supabase!.from("nutrition_goals").insert({
      user_id: session!.user.id,
      calories_kcal: targets.calories,
      protein_g: targets.protein,
      carbs_g: targets.carbs,
      fat_g: targets.fat,
      fiber_g: 25,
      sodium_mg: 2300,
      starts_on: today
    });
    if (goalError) return setMessage(goalError.message);

    setGoalTargets(targets);
    setState((current) => ({
      ...current,
      calorieTarget: targets.calories,
      fastingPlan: { ...current.fastingPlan, calorieTarget: targets.calories, weightKg: Number(onboardingForm.currentWeightKg) }
    }));
    setNeedsOnboarding(false);
    setMessage(`Metas salvas: ${targets.calories} kcal, ${targets.protein}g proteína, ${targets.carbs}g carboidratos e ${targets.fat}g gorduras.`);
  }


  async function saveCustomFood() {
    if (!isCloud) {
      setMessage("Entre com uma conta para salvar alimentos personalizados.");
      return;
    }
    if (!foodForm.name.trim() || !foodForm.calories) {
      setMessage("Preencha nome e calorias antes de salvar o alimento.");
      return;
    }

    const { data, error } = await supabase!.from("foods").insert({
      owner_id: session!.user.id,
      name: foodForm.name.trim(),
      source: "user",
      region: "BR",
      verified: false,
      serving_size: selectedPer100gFood ? 100 : Number(foodForm.quantity) || 1,
      serving_unit: foodForm.unit.trim() || "porção",
      calories_kcal: Number(foodForm.calories) || 0,
      protein_g: Number(foodForm.protein) || 0,
      carbs_g: Number(foodForm.carbs) || 0,
      fat_g: Number(foodForm.fat) || 0
    }).select("id,name,brand,source,calories_kcal,protein_g,carbs_g,fat_g,serving_unit,serving_size").single();

    if (error) return setMessage(error.message);
    if (data) {
      setFoodOptions((current) => [...current, {
        id: data.id,
        name: data.name,
        brand: data.brand,
        calories: Number(data.calories_kcal),
        protein: Number(data.protein_g),
        carbs: Number(data.carbs_g),
        fat: Number(data.fat_g),
        unit: data.serving_unit,
        source: (data.source as FoodSource) ?? "user",
        per100g: data.serving_unit === "g" && Number(data.serving_size ?? 100) === 100
      }].sort((a, b) => a.name.localeCompare(b.name)));
    }
    setMessage("Alimento salvo na sua base pessoal.");
  }
  async function addFood(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!foodForm.name.trim() || !foodForm.calories) return;
    const entry = {
      id: createId("food"),
      meal: foodForm.meal,
      name: foodForm.name.trim(),
      quantity: Number(foodForm.quantity) || 1,
      unit: foodForm.unit.trim() || "porção",
      calories: Number(foodForm.calories) || 0,
      protein: Number(foodForm.protein) || 0,
      carbs: Number(foodForm.carbs) || 0,
      fat: Number(foodForm.fat) || 0
    };

    if (isCloud) {
      const { data, error } = await supabase!.from("diary_entries").insert({
        user_id: session!.user.id,
        diary_date: selectedDate,
        meal: entry.meal,
        quantity: entry.quantity,
        unit: entry.unit,
        food_name_snapshot: entry.name,
        calories_kcal: entry.calories,
        protein_g: entry.protein,
        carbs_g: entry.carbs,
        fat_g: entry.fat
      }).select("id").single();
      if (error) return setMessage(error.message);
      entry.id = data.id;
    }

    setState((current) => ({ ...current, foodEntries: [...current.foodEntries, entry] }));
    setFoodForm((current) => ({ ...current, name: "", calories: "", protein: "", carbs: "", fat: "" }));
  }

  async function addWater(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountMl = Number(waterAmount);
    if (!amountMl || amountMl <= 0) return;
    const entry = { id: createId("water"), amountMl };
    if (isCloud) {
      const { data, error } = await supabase!.from("water_entries").insert({ user_id: session!.user.id, diary_date: selectedDate, amount_ml: amountMl }).select("id").single();
      if (error) return setMessage(error.message);
      entry.id = data.id;
    }
    setState((current) => ({ ...current, waterEntries: [...current.waterEntries, entry] }));
  }

  async function addExercise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!exerciseForm.name.trim()) return;
    const entry = { id: createId("exercise"), name: exerciseForm.name.trim(), minutes: Number(exerciseForm.minutes) || 0, calories: Number(exerciseForm.calories) || 0 };
    if (isCloud) {
      const { data, error } = await supabase!.from("exercise_entries").insert({ user_id: session!.user.id, diary_date: selectedDate, name: entry.name, duration_minutes: entry.minutes, calories_kcal: entry.calories }).select("id").single();
      if (error) return setMessage(error.message);
      entry.id = data.id;
    }
    setState((current) => ({ ...current, exerciseEntries: [...current.exerciseEntries, entry] }));
    setExerciseForm({ name: "", minutes: "30", calories: "" });
  }

  async function addWeight(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const weightKg = Number(weightForm);
    if (!weightKg || weightKg <= 0) return;
    const entry = { id: createId("weight"), weightKg, date: selectedDate };
    if (isCloud) {
      const { data, error } = await supabase!.from("weight_entries").insert({ user_id: session!.user.id, measured_on: selectedDate, weight_kg: weightKg }).select("id").single();
      if (error) return setMessage(error.message);
      entry.id = data.id;
    }
    setState((current) => ({ ...current, weightEntries: [...current.weightEntries, entry], fastingPlan: { ...current.fastingPlan, weightKg } }));
    setWeightForm("");
  }

  async function deleteFood(id: string) {
    if (isCloud) {
      const { error } = await supabase!.from("diary_entries").delete().eq("id", id);
      if (error) return setMessage(error.message);
    }
    setState((current) => ({ ...current, foodEntries: current.foodEntries.filter((entry) => entry.id !== id) }));
  }

  async function saveFastingPlan(nextPlan: FastingPlan) {
    setState((current) => ({ ...current, fastingPlan: nextPlan }));
    const guidance = await getFastingGuidanceWithApi(nextPlan);
    setFastingGuidance(guidance);
    if (!isCloud) return;
    const [fastingHours, eatingWindowHours] = protocolHours[nextPlan.protocol];
    const payload = {
      user_id: session!.user.id,
      protocol: nextPlan.protocol,
      fasting_hours: fastingHours,
      eating_window_hours: eatingWindowHours,
      last_meal_time: nextPlan.lastMeal,
      next_meal_time: addHours(nextPlan.lastMeal, fastingHours),
      hydration_target_ml: guidance.hydration,
      break_fast_min_kcal: guidance.minKcal,
      break_fast_max_kcal: guidance.maxKcal,
      protein_min_g: guidance.protein,
      fiber_min_g: guidance.fiber,
      active: true
    };
    const query = nextPlan.id
      ? supabase!.from("fasting_plans").update(payload).eq("id", nextPlan.id).select("id").single()
      : supabase!.from("fasting_plans").insert(payload).select("id").single();
    const { data, error } = await query;
    if (error) setMessage(error.message);
    else if (data?.id) setState((current) => ({ ...current, fastingPlan: { ...current.fastingPlan, id: data.id } }));
  }

  function resetDemo() {
    window.localStorage.removeItem("nutricao-fitness-state");
    setState(defaultState);
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><Apple size={20} /></span>Nutrição & Fitness</div>
        <nav className="nav" aria-label="Navegação principal">
          <a className="active" href="#today"><Utensils size={18} /> Hoje</a>
          <a href="#food"><Search size={18} /> Registrar</a>
          <a href="#fasting"><Clock3 size={18} /> Jejum</a>
          <a href="#progress"><BarChart3 size={18} /> Progresso</a>
          {session ? <a href="#profile" onClick={() => setShowProfileEditor(true)}><UserCog size={18} /> Perfil</a> : null}
        </nav>
      </aside>

      <main className="main">
        <section className="topbar" id="today">
          <div>
            <div className="eyebrow">{isCloud ? "Conectado ao Supabase" : "Modo local"}</div>
            <h1>Registre refeições, água, exercícios, peso e jejum.</h1>
            <p className="lead">{isCloud ? `Sessão ativa para ${session?.user.email}. Os registros de ${selectedDate} estão sendo salvos no Supabase.` : "Entre com sua conta para salvar no Supabase. Sem login, os dados ficam apenas neste navegador."}</p>
          </div>
          {session ? <button className="secondary-action" type="button" onClick={() => supabase?.auth.signOut()}><LogOut size={18} /> Sair</button> : <button className="secondary-action" type="button" onClick={resetDemo}><RotateCcw size={18} /> Reiniciar demo</button>}
        </section>

        <section className="date-panel card">
          <label className="field">Data do diário<input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /></label>
          <p className="muted">Alimentos, água, exercícios e peso serão carregados e registrados para a data selecionada.</p>
        </section>

        {!session ? (
          <section className="auth-panel card">
            <div>
              <div className="card-title">Acesso</div>
              <h2>{mode === "login" ? "Entrar na conta" : "Criar conta"}</h2>
              <p className="muted">Use o e-mail habilitado no Supabase Auth. Para teste local, a confirmação de e-mail pode ficar desativada.</p>
            </div>
            <form className="auth-form" onSubmit={submitAuth}>
              <input type="email" value={authForm.email} onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })} placeholder="email@empresa.com" required />
              <input type="password" value={authForm.password} onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })} placeholder="Senha" minLength={6} required />
              <button className="primary-action" type="submit">{mode === "login" ? "Entrar" : "Cadastrar"}</button>
              <button className="secondary-action" type="button" onClick={() => setMode(mode === "login" ? "signup" : "login")}>{mode === "login" ? "Criar conta" : "Já tenho conta"}</button>
            </form>
          </section>
        ) : null}

        {message ? <p className="status-line">{loadingRemote ? "Carregando: " : ""}{message}</p> : null}

        {session && (needsOnboarding || showProfileEditor) ? (
          <section className="onboarding-panel card" id="profile">
            <div>
              <div className="card-title">{needsOnboarding ? "Primeira configuração" : "Perfil e metas"}</div>
              <h2>{needsOnboarding ? "Personalizar metas do funcionário" : "Editar dados e recalcular metas"}</h2>
              <p className="muted">Esses dados alimentam o cálculo de calorias, macros e orientação de jejum. São estimativas educativas, não prescrição médica.</p>
            </div>
            <form className="onboarding-form" onSubmit={submitOnboarding}>
              <label className="field wide">Nome<input value={onboardingForm.fullName} onChange={(event) => setOnboardingForm({ ...onboardingForm, fullName: event.target.value })} placeholder="Nome do funcionário" /></label>
              <label className="field">Nascimento<input type="date" value={onboardingForm.birthDate} onChange={(event) => setOnboardingForm({ ...onboardingForm, birthDate: event.target.value })} required /></label>
              <label className="field">Sexo<select value={onboardingForm.sex} onChange={(event) => setOnboardingForm({ ...onboardingForm, sex: event.target.value as OnboardingForm["sex"] })}><option value="male">Masculino</option><option value="female">Feminino</option></select></label>
              <label className="field">Altura cm<input type="number" value={onboardingForm.heightCm} onChange={(event) => setOnboardingForm({ ...onboardingForm, heightCm: event.target.value })} required /></label>
              <label className="field">Peso atual kg<input type="number" step="0.1" value={onboardingForm.currentWeightKg} onChange={(event) => setOnboardingForm({ ...onboardingForm, currentWeightKg: event.target.value })} required /></label>
              <label className="field">Peso meta kg<input type="number" step="0.1" value={onboardingForm.targetWeightKg} onChange={(event) => setOnboardingForm({ ...onboardingForm, targetWeightKg: event.target.value })} required /></label>
              <label className="field">Atividade<select value={onboardingForm.activityLevel} onChange={(event) => setOnboardingForm({ ...onboardingForm, activityLevel: event.target.value as OnboardingForm["activityLevel"] })}><option value="sedentary">Sedentário</option><option value="light">Leve</option><option value="moderate">Moderado</option><option value="active">Ativo</option><option value="very_active">Muito ativo</option></select></label>
              <label className="field">Objetivo<select value={onboardingForm.goal} onChange={(event) => setOnboardingForm({ ...onboardingForm, goal: event.target.value as OnboardingForm["goal"] })}><option value="lose">Perder peso</option><option value="maintain">Manter peso</option><option value="gain">Ganhar peso</option></select></label>
              <button className="primary-action" type="submit"><Plus size={18} /> Salvar metas</button>{!needsOnboarding ? <button className="secondary-action" type="button" onClick={() => setShowProfileEditor(false)}>Cancelar</button> : null}
            </form>
          </section>
        ) : null}

        <section className="grid" aria-label="Resumo do dia">
          <article className="card span-3"><div className="card-title">Calorias restantes</div><div className="metric">{remaining}<small> kcal</small></div><div className="progress"><span style={{ width: `${Math.min(100, Math.round((totals.consumed / state.calorieTarget) * 100))}%`, background: "var(--green)" }} /></div></article>
          <article className="card span-3"><div className="card-title">Consumidas</div><div className="metric">{totals.consumed}<small> kcal</small></div><p className="muted">Meta: {state.calorieTarget} kcal</p></article>
          <article className="card span-3"><div className="card-title">Água</div><div className="metric">{(totals.water / 1000).toFixed(1)}<small> L</small></div><div className="progress"><span style={{ width: `${Math.min(100, Math.round((totals.water / 2500) * 100))}%`, background: "var(--blue)" }} /></div></article>
          <article className="card span-3"><div className="card-title">Exercícios</div><div className="metric">{totals.exercise}<small> kcal</small></div><p className="muted">Crédito configurável no diário.</p></article>

          <article className="card span-7"><div className="card-title">Diário da data</div><div className="meals">{(Object.keys(mealLabels) as Meal[]).map((meal) => { const entries = state.foodEntries.filter((entry) => entry.meal === meal); const kcal = entries.reduce((sum, entry) => sum + entry.calories, 0); return <div className="meal-block" key={meal}><div className="meal-row meal-total"><div className="meal-name">{mealLabels[meal]}</div><div className="kcal">{kcal} kcal</div></div>{entries.length === 0 ? <p className="muted compact">Nenhum item registrado.</p> : null}{entries.map((entry) => <div className="entry-row" key={entry.id}><div><div>{entry.name}</div><div className="meal-food">{entry.quantity} {entry.unit} · P {entry.protein}g · C {entry.carbs}g · G {entry.fat}g</div></div><button className="icon-button" type="button" onClick={() => deleteFood(entry.id)} aria-label={`Remover ${entry.name}`}><Trash2 size={16} /></button></div>)}</div>; })}</div></article>

          <article className="card span-5"><div className="card-title">Macros</div><div className="macro-grid"><div className="macro"><span>Proteína</span><strong style={{ color: "var(--green)" }}>{totals.protein}g</strong><small>meta {goalTargets.protein}g</small></div><div className="macro"><span>Carboidratos</span><strong style={{ color: "var(--blue)" }}>{totals.carbs}g</strong><small>meta {goalTargets.carbs}g</small></div><div className="macro"><span>Gorduras</span><strong style={{ color: "var(--coral)" }}>{totals.fat}g</strong><small>meta {goalTargets.fat}g</small></div></div><label className="field solo">Meta calórica diária<input type="number" value={state.calorieTarget} onChange={(event) => setState((current) => ({ ...current, calorieTarget: Number(event.target.value) || 0, fastingPlan: { ...current.fastingPlan, calorieTarget: Number(event.target.value) || 0 } }))} /></label></article>

          <article className="card span-12" id="food"><div className="card-title">Registrar alimento</div><form className="external-food-search" onSubmit={searchExternalFoods}><input value={externalFoodQuery} onChange={(event) => setExternalFoodQuery(event.target.value)} placeholder="Buscar na base ampliada: iogurte, arroz, pão integral..." /><button className="secondary-action" type="submit"><Search size={18} /> Buscar</button></form>{externalFoods.length ? <div className="external-results">{externalFoods.map((item) => <button className="external-result" type="button" key={`${item.code}-${item.name}`} onClick={() => chooseExternalFood(item)}><div className="result-heading"><strong>{item.name}</strong><em>{foodSourceLabel(item.source)}</em></div><span>{item.brand || foodSourceLabel(item.source)} · {Math.round(item.calories_kcal_100g)} kcal/100g · P {item.protein_g_100g}g · C {item.carbs_g_100g}g · G {item.fat_g_100g}g</span></button>)}</div> : null}{foodOptions.length ? <label className="field solo">Alimentos do Supabase<select defaultValue="" onChange={(event) => chooseFoodOption(event.target.value)}><option value="" disabled>Selecionar alimento da base</option>{foodOptions.map((item) => <option key={item.id} value={item.id}>{item.name}{item.brand ? ` - ${item.brand}` : ""} · {foodSourceLabel(item.source)}</option>)}</select></label> : null}<form className="form-grid" onSubmit={addFood}><label className="field wide">Alimento<input value={foodForm.name} onChange={(event) => { setSelectedPer100gFood(null); setFoodForm({ ...foodForm, name: event.target.value }); }} placeholder="Ex.: arroz, feijão e frango" /></label><label className="field">Refeição<select value={foodForm.meal} onChange={(event) => setFoodForm({ ...foodForm, meal: event.target.value as Meal })}>{Object.entries(mealLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="field">Qtd.<input type="number" value={foodForm.quantity} onChange={(event) => { setFoodForm({ ...foodForm, quantity: event.target.value }); if (selectedPer100gFood) applyPer100gFood(selectedPer100gFood, Number(event.target.value)); }} /></label><label className="field">Unidade<input value={foodForm.unit} onChange={(event) => { setSelectedPer100gFood(null); setFoodForm({ ...foodForm, unit: event.target.value }); }} /></label><label className="field">Kcal<input type="number" value={foodForm.calories} onChange={(event) => setFoodForm({ ...foodForm, calories: event.target.value })} /></label><label className="field">Proteína g<input type="number" value={foodForm.protein} onChange={(event) => setFoodForm({ ...foodForm, protein: event.target.value })} /></label><label className="field">Carbo. g<input type="number" value={foodForm.carbs} onChange={(event) => setFoodForm({ ...foodForm, carbs: event.target.value })} /></label><label className="field">Gord. g<input type="number" value={foodForm.fat} onChange={(event) => setFoodForm({ ...foodForm, fat: event.target.value })} /></label><button className="primary-action" type="submit"><Plus size={18} /> Adicionar</button><button className="secondary-action" type="button" onClick={saveCustomFood}>Salvar na base</button></form></article>

          <article className="card span-4"><div className="card-title"><Droplets size={16} /> Água</div><form className="inline-form" onSubmit={addWater}><input type="number" value={waterAmount} onChange={(event) => setWaterAmount(event.target.value)} /><button className="primary-action" type="submit">ml</button></form></article>
          <article className="card span-4"><div className="card-title"><Dumbbell size={16} /> Exercício</div><form className="stack-form" onSubmit={addExercise}><input value={exerciseForm.name} onChange={(event) => setExerciseForm({ ...exerciseForm, name: event.target.value })} placeholder="Ex.: musculação" /><div className="two-cols"><input type="number" value={exerciseForm.minutes} onChange={(event) => setExerciseForm({ ...exerciseForm, minutes: event.target.value })} placeholder="min" /><input type="number" value={exerciseForm.calories} onChange={(event) => setExerciseForm({ ...exerciseForm, calories: event.target.value })} placeholder="kcal" /></div><button className="primary-action" type="submit"><Plus size={18} /> Adicionar</button></form></article>
          <article className="card span-4" id="progress"><div className="card-title"><Scale size={16} /> Peso</div><form className="inline-form" onSubmit={addWeight}><input type="number" step="0.1" value={weightForm} onChange={(event) => setWeightForm(event.target.value)} placeholder="kg" /><button className="primary-action" type="submit">Salvar</button></form><p className="muted">Na data: {state.weightEntries.find((entry) => entry.date === selectedDate)?.weightKg ?? "-"} kg · Último: {state.weightEntries.at(-1)?.weightKg ?? "-"} kg</p></article>

          <article className="card span-12 fasting-card" id="fasting"><div className="fasting-header"><div><div className="card-title">Plano de jejum intermitente</div><h2>Protocolo {state.fastingPlan.protocol}: última refeição {state.fastingPlan.lastMeal}, próxima {fastingGuidance.nextMeal}</h2></div><span className="fasting-pill"><Clock3 size={16} /> {fastingGuidance.fastingHours}h jejum · {fastingGuidance.eatingWindowHours}h alimentação</span></div><div className="fasting-controls"><label className="field">Protocolo<select value={state.fastingPlan.protocol} onChange={(event) => saveFastingPlan({ ...state.fastingPlan, protocol: event.target.value as Protocol })}><option>12:12</option><option>14:10</option><option>16:8</option><option>18:6</option></select></label><label className="field">Última refeição<input type="time" value={state.fastingPlan.lastMeal} onChange={(event) => saveFastingPlan({ ...state.fastingPlan, lastMeal: event.target.value })} /></label><label className="field">Contexto<select value={state.fastingPlan.context} onChange={(event) => saveFastingPlan({ ...state.fastingPlan, context: event.target.value as Context })}><option value="work">Trabalho</option><option value="training">Treino</option><option value="hot_day">Dia quente</option><option value="rest">Repouso</option></select></label></div><div className="fasting-grid"><div><div className="fasting-label">Entre refeições</div><strong>{fastingGuidance.hydration} ml</strong><p>Meta mínima de hidratação entre a última e a próxima refeição.</p></div><div><div className="fasting-label">O que ingerir</div><strong>0 kcal</strong><p>Água, café sem açúcar, chá sem açúcar e eletrólitos sem calorias quando necessário.</p></div><div><div className="fasting-label">Próxima refeição</div><strong>{fastingGuidance.minKcal} a {fastingGuidance.maxKcal} kcal</strong><p>Com pelo menos {fastingGuidance.protein}g de proteína e {fastingGuidance.fiber}g de fibra, ajustando ao restante do diário.</p></div></div><p className="safety-note">Orientação educativa. Gestação, diabetes, histórico de transtorno alimentar, uso de medicação ou sintomas como tontura e tremor exigem avaliação profissional antes de seguir jejum.</p></article>
        </section>
      </main>
    </div>
  );
}
