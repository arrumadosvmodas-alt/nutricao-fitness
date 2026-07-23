"use client";

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import {
  Apple,
  BarChart3,
  Beef,
  ClipboardList,
  Clock3,
  Droplets,
  Dumbbell,
  Flame,
  LogOut,
  Megaphone,
  Plus,
  Pencil,
  RotateCcw,
  Scale,
  Search,
  ShieldCheck,
  Trash2,
  UserCog,
  Utensils
} from "lucide-react";
import { type CSSProperties, FormEvent, useEffect, useMemo, useState } from "react";
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
type ReportDay = { date: string; calories: number; protein: number; carbs: number; fat: number; waterMl: number; exercise: number };
type SavedMeal = { id: string; name: string; meal: Meal; items: Array<Omit<FoodEntry, "id">> };
type FoodSource = "open_food_facts" | "base_comum" | "user" | "supabase";
type FoodOption = { id: string; ownerId?: string | null; name: string; brand: string | null; calories: number; protein: number; carbs: number; fat: number; unit: string; servingSize?: number; per100g?: boolean; source?: FoodSource };
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

type FastingSession = { id: string; startedAt: string; endedAt?: string | null; targetEndAt: string; status: "active" | "completed" | "cancelled" };

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

type FoodCategory = "basics" | "protein" | "breakfast" | "fruit" | "fast_food" | "drinks" | "sweets";

const foodCategories: Array<{ id: FoodCategory; label: string; query: string; items: string[] }> = [
  { id: "basics", label: "Básicos", query: "arroz feijao frango ovo batata", items: ["Arroz branco", "Feijão carioca", "Peito de frango", "Ovo cozido", "Batata-doce"] },
  { id: "protein", label: "Proteínas", query: "carne frango ovo peixe atum", items: ["Carne bovina", "Frango grelhado", "Ovo mexido", "Tilápia", "Atum"] },
  { id: "breakfast", label: "Café da manhã", query: "pao leite iogurte banana aveia queijo", items: ["Pão francês", "Leite integral", "Iogurte natural", "Banana", "Aveia"] },
  { id: "fruit", label: "Frutas", query: "banana maca mamao laranja abacate", items: ["Banana", "Maçã", "Mamão", "Laranja", "Abacate"] },
  { id: "fast_food", label: "Fast food", query: "hamburguer pizza batata frita coxinha cachorro quente", items: ["Hambúrguer", "Pizza", "Batata frita", "Coxinha", "Cachorro-quente"] },
  { id: "drinks", label: "Bebidas", query: "agua refrigerante suco leite", items: ["Água", "Refrigerante", "Suco de laranja", "Leite integral"] },
  { id: "sweets", label: "Doces", query: "brigadeiro sorvete chocolate doce", items: ["Brigadeiro", "Sorvete", "Chocolate", "Doce"] }
];

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

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}
function getRecentDates(endDate: string, count = 7) {
  const end = new Date(`${endDate}T00:00:00`);
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(end);
    day.setDate(end.getDate() - (count - 1 - index));
    return day.toISOString().slice(0, 10);
  });
}

function shortDateLabel(date: string) {
  const [, month, day] = date.split("-");
  return `${day}/${month}`;
}

function addHoursToDate(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function formatDuration(ms: number) {
  const safeMs = Math.max(0, ms);
  const totalMinutes = Math.floor(safeMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}min`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

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
  const [isAdmin, setIsAdmin] = useState(false);
  const [reportDays, setReportDays] = useState<ReportDay[]>([]);
  const [reportRange, setReportRange] = useState<7 | 15 | 30>(7);
  const [savedMeals, setSavedMeals] = useState<SavedMeal[]>([]);
  const [savedMealForm, setSavedMealForm] = useState({ name: "", meal: "lunch" as Meal });
  const [editingSavedMealId, setEditingSavedMealId] = useState<string | null>(null);
  const [editingSavedMealForm, setEditingSavedMealForm] = useState({ name: "", meal: "lunch" as Meal });
  const [externalFoodQuery, setExternalFoodQuery] = useState("");
  const [externalFoods, setExternalFoods] = useState<ExternalFood[]>([]);
  const [selectedPer100gFood, setSelectedPer100gFood] = useState<FoodOption | null>(null);
  const [editingFoodId, setEditingFoodId] = useState<string | null>(null);
  const [foodBaseForm, setFoodBaseForm] = useState({ name: "", brand: "", servingSize: "100", unit: "g", calories: "", protein: "", carbs: "", fat: "" });
  const [adminFoodForm, setAdminFoodForm] = useState({ name: "", brand: "Base comum", servingSize: "100", unit: "g", calories: "", protein: "", carbs: "", fat: "" });
  const [editingAdminFoodId, setEditingAdminFoodId] = useState<string | null>(null);
  const [adminEditForm, setAdminEditForm] = useState({ name: "", brand: "Base comum", servingSize: "100", unit: "g", calories: "", protein: "", carbs: "", fat: "" });
  const [adminFoodSearch, setAdminFoodSearch] = useState("");
  const [adminSourceFilter, setAdminSourceFilter] = useState<"all" | FoodSource>("all");
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const supportEmail = "hslspe2@gmail.com";
  const [goalTargets, setGoalTargets] = useState<GoalTargets>(defaultTargets);
  const [fastingGuidance, setFastingGuidance] = useState<FastingGuidance>(getLocalFastingGuidance(defaultState.fastingPlan));
  const [fastingSessions, setFastingSessions] = useState<FastingSession[]>([]);
  const [nowTick, setNowTick] = useState(() => Date.now());
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
  const [activeFoodCategory, setActiveFoodCategory] = useState<FoodCategory | "all">("all");
  const [editingDiaryEntryId, setEditingDiaryEntryId] = useState<string | null>(null);
  const [diaryEditForm, setDiaryEditForm] = useState({ meal: "lunch" as Meal, name: "", quantity: "1", unit: "porção", calories: "", protein: "", carbs: "", fat: "" });
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
    const timer = window.setInterval(() => setNowTick(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!supabase || !session) return;
    void loadRemoteData();
  }, [supabase, session, selectedDate, reportRange]);

  async function loadRemoteData() {
    if (!supabase || !session) return;
    setLoadingRemote(true);
    setMessage("Sincronizando com Supabase...");
    await ensureProfile(supabase, session);

    const reportDates = getRecentDates(selectedDate, reportRange);
    const reportStart = reportDates[0];
    const [profile, foods, adminStatus, diary, water, exercise, weight, goals, fasting, fastingSessionRows, savedMealRows, reportDiary, reportWater, reportExercise] = await Promise.all([
      supabase.from("profiles").select("full_name,birth_date,sex,height_cm,current_weight_kg,target_weight_kg,activity_level,goal").eq("id", session.user.id).maybeSingle(),
      supabase.from("foods").select("id,owner_id,name,brand,source,calories_kcal,protein_g,carbs_g,fat_g,serving_unit,serving_size").order("name").limit(100),
      supabase.from("app_admins").select("user_id").eq("user_id", session.user.id).maybeSingle(),
      supabase.from("diary_entries").select("id,meal,food_name_snapshot,quantity,unit,calories_kcal,protein_g,carbs_g,fat_g").eq("diary_date", selectedDate).order("created_at"),
      supabase.from("water_entries").select("id,amount_ml").eq("diary_date", selectedDate).order("created_at"),
      supabase.from("exercise_entries").select("id,name,duration_minutes,calories_kcal").eq("diary_date", selectedDate).order("created_at"),
      supabase.from("weight_entries").select("id,weight_kg,measured_on").order("measured_on", { ascending: true }).limit(30),
      supabase.from("nutrition_goals").select("calories_kcal,protein_g,carbs_g,fat_g").order("created_at", { ascending: false }).limit(1),
      supabase.from("fasting_plans").select("id,protocol,last_meal_time,next_meal_time,hydration_target_ml,break_fast_min_kcal,break_fast_max_kcal,protein_min_g,active").eq("active", true).order("created_at", { ascending: false }).limit(1),
      supabase.from("fasting_sessions").select("id,started_at,ended_at,target_end_at,status").order("started_at", { ascending: false }).limit(8),
      supabase.from("saved_meals").select("id,name,meal,items").order("created_at", { ascending: false }).limit(20),
      supabase.from("diary_entries").select("diary_date,calories_kcal,protein_g,carbs_g,fat_g").gte("diary_date", reportStart).lte("diary_date", selectedDate),
      supabase.from("water_entries").select("diary_date,amount_ml").gte("diary_date", reportStart).lte("diary_date", selectedDate),
      supabase.from("exercise_entries").select("diary_date,calories_kcal").gte("diary_date", reportStart).lte("diary_date", selectedDate)
    ]);

    setIsAdmin(Boolean(adminStatus.data));

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
        ownerId: item.owner_id,
        name: item.name,
        brand: item.brand,
        calories: Number(item.calories_kcal),
        protein: Number(item.protein_g),
        carbs: Number(item.carbs_g),
        fat: Number(item.fat_g),
        unit: item.serving_unit,
        servingSize: Number(item.serving_size ?? 100),
        source: (item.source as FoodSource) ?? "supabase",
        per100g: item.serving_unit === "g" && Number(item.serving_size ?? 100) === 100
      })));
    }



    if (savedMealRows.data) {
      setSavedMeals(savedMealRows.data.map((item) => ({
        id: item.id,
        name: item.name,
        meal: item.meal as Meal,
        items: Array.isArray(item.items) ? item.items as Array<Omit<FoodEntry, "id">> : []
      })));
    }
    setFastingSessions(fastingSessionRows.data?.map((item) => ({ id: item.id, startedAt: item.started_at, endedAt: item.ended_at, targetEndAt: item.target_end_at, status: item.status as "active" | "completed" | "cancelled" })) ?? []);

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


    const weeklyReport = reportDates.map((date) => {
      const diaryRows = reportDiary.data?.filter((entry) => entry.diary_date === date) ?? [];
      const waterRows = reportWater.data?.filter((entry) => entry.diary_date === date) ?? [];
      const exerciseRows = reportExercise.data?.filter((entry) => entry.diary_date === date) ?? [];
      return {
        date,
        calories: diaryRows.reduce((sum, entry) => sum + Number(entry.calories_kcal ?? 0), 0),
        protein: Math.round(diaryRows.reduce((sum, entry) => sum + Number(entry.protein_g ?? 0), 0) * 10) / 10,
        carbs: Math.round(diaryRows.reduce((sum, entry) => sum + Number(entry.carbs_g ?? 0), 0) * 10) / 10,
        fat: Math.round(diaryRows.reduce((sum, entry) => sum + Number(entry.fat_g ?? 0), 0) * 10) / 10,
        waterMl: waterRows.reduce((sum, entry) => sum + Number(entry.amount_ml ?? 0), 0),
        exercise: exerciseRows.reduce((sum, entry) => sum + Number(entry.calories_kcal ?? 0), 0)
      };
    });
    setReportDays(weeklyReport);
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
  const myFoodOptions = foodOptions.filter((item) => item.ownerId === session?.user.id);
  const globalFoodOptions = foodOptions.filter((item) => !item.ownerId);
  const normalizedAdminSearch = adminFoodSearch.trim().toLowerCase();
  const filteredGlobalFoodOptions = globalFoodOptions.filter((item) => {
    const matchesSearch = !normalizedAdminSearch || `${item.name} ${item.brand ?? ""}`.toLowerCase().includes(normalizedAdminSearch);
    const matchesSource = adminSourceFilter === "all" || item.source === adminSourceFilter;
    return matchesSearch && matchesSource;
  });
  const adminDuplicateFood = adminFoodForm.name.trim()
    ? globalFoodOptions.find((item) => item.name.trim().toLowerCase() === adminFoodForm.name.trim().toLowerCase())
    : undefined;
  const recentFoods = Array.from(
    new Map(state.foodEntries.map((entry) => [entry.name.toLowerCase(), entry])).values()
  ).slice(-6).reverse();
  const reportSource = reportDays.length ? reportDays : [{ date: selectedDate, calories: totals.consumed, protein: totals.protein, carbs: totals.carbs, fat: totals.fat, waterMl: totals.water, exercise: totals.exercise }];
  const reportTotals = reportSource.reduce((acc, day) => ({
    calories: acc.calories + day.calories,
    protein: acc.protein + day.protein,
    carbs: acc.carbs + day.carbs,
    fat: acc.fat + day.fat,
    waterMl: acc.waterMl + day.waterMl,
    exercise: acc.exercise + day.exercise,
    completeDays: acc.completeDays + (day.calories > 0 ? 1 : 0),
    adherentDays: acc.adherentDays + (day.calories >= state.calorieTarget * 0.8 && day.calories <= state.calorieTarget * 1.1 ? 1 : 0)
  }), { calories: 0, protein: 0, carbs: 0, fat: 0, waterMl: 0, exercise: 0, completeDays: 0, adherentDays: 0 });
  const reportCount = Math.max(reportSource.length, 1);
  const reportAverageCalories = Math.round(reportTotals.calories / reportCount);
  const reportAverageWater = Math.round(reportTotals.waterMl / reportCount);
  const reportAdherence = Math.round((reportTotals.adherentDays / reportCount) * 100);
  const maxReportCalories = Math.max(...reportSource.map((day) => day.calories), state.calorieTarget, 1);
  const latestWeight = state.weightEntries.at(-1);
  const previousWeight = state.weightEntries.length > 1 ? state.weightEntries.at(-2) : undefined;
  const weightDelta = latestWeight && previousWeight ? Math.round((latestWeight.weightKg - previousWeight.weightKg) * 10) / 10 : null;
  const reportAverageProtein = Math.round((reportTotals.protein / reportCount) * 10) / 10;
  const reportAverageCarbs = Math.round((reportTotals.carbs / reportCount) * 10) / 10;
  const reportAverageFat = Math.round((reportTotals.fat / reportCount) * 10) / 10;
  const reportNotes = [
    reportTotals.completeDays >= Math.ceil(reportCount * 0.7) ? "Boa consistência de registro no período." : "Registro ainda irregular; completar mais dias melhora a análise.",
    reportAverageProtein >= goalTargets.protein * 0.8 ? "Proteína média próxima da meta." : "Proteína média abaixo da meta estimada.",
    reportAverageWater >= 2000 ? "Hidratação média adequada." : "Hidratação média abaixo de 2L/dia.",
    reportAdherence >= 70 ? "Boa aderência à faixa calórica." : "Aderência calórica ainda pode melhorar."
  ];
  const calorieProgress = Math.min(150, Math.round((totals.consumed / Math.max(state.calorieTarget, 1)) * 100));
  const waterProgress = Math.min(150, Math.round((totals.water / 2500) * 100));
  const proteinProgress = Math.min(150, Math.round((totals.protein / Math.max(goalTargets.protein, 1)) * 100));
  const dashboardScore = Math.round(Math.min(100, (Math.min(calorieProgress, 100) * 0.35) + (Math.min(waterProgress, 100) * 0.25) + (Math.min(proteinProgress, 100) * 0.25) + (Math.min(reportAdherence, 100) * 0.15)));
  const calorieStatus = remaining >= 0 ? `${remaining} kcal disponíveis` : `${Math.abs(remaining)} kcal acima da meta`;
  const nextAction = totals.consumed === 0
    ? "Comece registrando a primeira refeição da data."
    : totals.protein < goalTargets.protein * 0.7
      ? "Priorize uma fonte de proteína na próxima refeição."
      : totals.water < 2000
        ? "Aumente a hidratação até chegar perto de 2 litros."
        : remaining < 0
          ? "Compense com escolhas mais leves no restante do dia."
          : "Dia bem encaminhado; mantenha o registro completo.";
  const followUpSummary = [
    `Resumo de acompanhamento (${shortDateLabel(reportSource[0].date)} a ${shortDateLabel(reportSource[reportSource.length - 1].date)})`,
    `Dias com registro: ${reportTotals.completeDays}/${reportCount}`,
    `Aderência calórica: ${reportAdherence}%`,
    `Média calórica: ${reportAverageCalories} kcal/dia (meta atual: ${state.calorieTarget} kcal)`,
    `Macros médios: proteína ${reportAverageProtein}g, carboidratos ${reportAverageCarbs}g, gorduras ${reportAverageFat}g`,
    `Água média: ${(reportAverageWater / 1000).toFixed(1)} L/dia`,
    `Peso atual: ${latestWeight ? `${latestWeight.weightKg} kg` : "sem registro"}${weightDelta === null ? "" : ` (${weightDelta > 0 ? "+" : ""}${weightDelta} kg vs. anterior)`}`,
    `Observações: ${reportNotes.join(" ")}`
  ].join("\n");


  async function copyFollowUpSummary() {
    try {
      await navigator.clipboard.writeText(followUpSummary);
      setMessage("Resumo copiado para a área de transferência.");
    } catch {
      setMessage("Não foi possível copiar automaticamente. Selecione o texto e copie manualmente.");
    }
  }
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
      ownerId: null,
      name: food.brand ? `${food.name} - ${food.brand}` : food.name,
      brand: food.brand ?? null,
      calories: Number(food.calories_kcal_100g) || 0,
      protein: Number(food.protein_g_100g) || 0,
      carbs: Number(food.carbs_g_100g) || 0,
      fat: Number(food.fat_g_100g) || 0,
      unit: "g",
      servingSize: 100,
      source: food.source ?? "open_food_facts",
      per100g: true
    };
    setSelectedPer100gFood(option);
    applyPer100gFood(option, 100);
  }


  function chooseRecentFood(entry: FoodEntry) {
    setSelectedPer100gFood(null);
    setFoodForm((current) => ({
      ...current,
      meal: entry.meal,
      name: entry.name,
      quantity: String(entry.quantity),
      unit: entry.unit,
      calories: String(entry.calories),
      protein: String(entry.protein),
      carbs: String(entry.carbs),
      fat: String(entry.fat)
    }));
    setMessage(`Alimento recente carregado: ${entry.name}.`);
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
    }).select("id,owner_id,name,brand,source,calories_kcal,protein_g,carbs_g,fat_g,serving_unit,serving_size").single();

    if (error) return setMessage(error.message);
    if (data) {
      setFoodOptions((current) => [...current, {
        id: data.id,
        ownerId: data.owner_id,
        name: data.name,
        brand: data.brand,
        calories: Number(data.calories_kcal),
        protein: Number(data.protein_g),
        carbs: Number(data.carbs_g),
        fat: Number(data.fat_g),
        unit: data.serving_unit,
        servingSize: Number(data.serving_size ?? 100),
        source: (data.source as FoodSource) ?? "user",
        per100g: data.serving_unit === "g" && Number(data.serving_size ?? 100) === 100
      }].sort((a, b) => a.name.localeCompare(b.name)));
    }
    setMessage("Alimento salvo na sua base pessoal.");
  }

  async function saveAdminFood(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isCloud) return setMessage("Entre na conta para usar o painel admin.");
    if (!isAdmin) return setMessage("Seu usuário não está liberado como admin.");
    if (!adminFoodForm.name.trim() || !adminFoodForm.calories) return setMessage("Preencha nome e calorias do alimento global.");
    if (adminDuplicateFood && !window.confirm(`Já existe um alimento global chamado "${adminDuplicateFood.name}". Deseja cadastrar mesmo assim?`)) return;
    const { data, error } = await supabase!.from("foods").insert({
      owner_id: null,
      name: adminFoodForm.name.trim(),
      brand: adminFoodForm.brand.trim() || "Base comum",
      source: "base_comum",
      region: "BR",
      verified: true,
      serving_size: Number(adminFoodForm.servingSize) || 100,
      serving_unit: adminFoodForm.unit.trim() || "g",
      calories_kcal: Number(adminFoodForm.calories) || 0,
      protein_g: Number(adminFoodForm.protein) || 0,
      carbs_g: Number(adminFoodForm.carbs) || 0,
      fat_g: Number(adminFoodForm.fat) || 0
    }).select("id,owner_id,name,brand,source,calories_kcal,protein_g,carbs_g,fat_g,serving_unit,serving_size").single();
    if (error) return setMessage(error.message);
    if (data) {
      setFoodOptions((current) => [{
        id: data.id,
        ownerId: data.owner_id,
        name: data.name,
        brand: data.brand,
        calories: Number(data.calories_kcal),
        protein: Number(data.protein_g),
        carbs: Number(data.carbs_g),
        fat: Number(data.fat_g),
        unit: data.serving_unit,
        servingSize: Number(data.serving_size ?? 100),
        source: (data.source as FoodSource) ?? "base_comum",
        per100g: data.serving_unit === "g" && Number(data.serving_size ?? 100) === 100
      }, ...current].sort((a, b) => a.name.localeCompare(b.name)));
    }
    setAdminFoodForm({ name: "", brand: "Base comum", servingSize: "100", unit: "g", calories: "", protein: "", carbs: "", fat: "" });
    setMessage("Alimento global adicionado à base.");
  }
  function startEditAdminFood(food: FoodOption) {
    setEditingAdminFoodId(food.id);
    setAdminEditForm({
      name: food.name,
      brand: food.brand ?? "Base comum",
      servingSize: String(food.servingSize ?? 100),
      unit: food.unit || "g",
      calories: String(food.calories),
      protein: String(food.protein),
      carbs: String(food.carbs),
      fat: String(food.fat)
    });
  }

  function cancelEditAdminFood() {
    setEditingAdminFoodId(null);
    setAdminEditForm({ name: "", brand: "Base comum", servingSize: "100", unit: "g", calories: "", protein: "", carbs: "", fat: "" });
  }

  async function updateAdminFood(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isCloud || !isAdmin || !editingAdminFoodId) return;
    if (!adminEditForm.name.trim() || !adminEditForm.calories) return setMessage("Preencha nome e calorias para atualizar o alimento global.");
    const payload = {
      owner_id: null,
      name: adminEditForm.name.trim(),
      brand: adminEditForm.brand.trim() || "Base comum",
      source: "base_comum",
      region: "BR",
      verified: true,
      serving_size: Number(adminEditForm.servingSize) || 100,
      serving_unit: adminEditForm.unit.trim() || "g",
      calories_kcal: Number(adminEditForm.calories) || 0,
      protein_g: Number(adminEditForm.protein) || 0,
      carbs_g: Number(adminEditForm.carbs) || 0,
      fat_g: Number(adminEditForm.fat) || 0
    };
    const { data, error } = await supabase!.from("foods").update(payload).eq("id", editingAdminFoodId).select("id,owner_id,name,brand,source,calories_kcal,protein_g,carbs_g,fat_g,serving_unit,serving_size").single();
    if (error) return setMessage(error.message);
    if (data) {
      setFoodOptions((current) => current.map((item) => item.id === data.id ? {
        id: data.id,
        ownerId: data.owner_id,
        name: data.name,
        brand: data.brand,
        calories: Number(data.calories_kcal),
        protein: Number(data.protein_g),
        carbs: Number(data.carbs_g),
        fat: Number(data.fat_g),
        unit: data.serving_unit,
        servingSize: Number(data.serving_size ?? 100),
        source: (data.source as FoodSource) ?? "base_comum",
        per100g: data.serving_unit === "g" && Number(data.serving_size ?? 100) === 100
      } : item).sort((a, b) => a.name.localeCompare(b.name)));
    }
    cancelEditAdminFood();
    setMessage("Alimento global atualizado.");
  }

  async function deleteAdminFood(id: string) {
    if (!isCloud || !isAdmin) return;
    if (!window.confirm("Excluir este alimento global? Ele deixará de aparecer para todos os usuários.")) return;
    const { error } = await supabase!.from("foods").delete().eq("id", id).is("owner_id", null);
    if (error) return setMessage(error.message);
    setFoodOptions((current) => current.filter((item) => item.id !== id));
    if (editingAdminFoodId === id) cancelEditAdminFood();
    setMessage("Alimento global excluído.");
  }
  function startEditFood(food: FoodOption) {
    setEditingFoodId(food.id);
    setFoodBaseForm({
      name: food.name,
      brand: food.brand ?? "",
      servingSize: String(food.servingSize ?? 100),
      unit: food.unit || "g",
      calories: String(food.calories),
      protein: String(food.protein),
      carbs: String(food.carbs),
      fat: String(food.fat)
    });
  }

  function cancelEditFood() {
    setEditingFoodId(null);
    setFoodBaseForm({ name: "", brand: "", servingSize: "100", unit: "g", calories: "", protein: "", carbs: "", fat: "" });
  }

  async function updateFoodBase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isCloud || !editingFoodId) return;
    if (!foodBaseForm.name.trim() || !foodBaseForm.calories) {
      setMessage("Preencha nome e calorias para atualizar o alimento.");
      return;
    }

    const payload = {
      name: foodBaseForm.name.trim(),
      brand: foodBaseForm.brand.trim() || null,
      serving_size: Number(foodBaseForm.servingSize) || 100,
      serving_unit: foodBaseForm.unit.trim() || "g",
      calories_kcal: Number(foodBaseForm.calories) || 0,
      protein_g: Number(foodBaseForm.protein) || 0,
      carbs_g: Number(foodBaseForm.carbs) || 0,
      fat_g: Number(foodBaseForm.fat) || 0
    };

    const { data, error } = await supabase!.from("foods").update(payload).eq("id", editingFoodId).select("id,owner_id,name,brand,source,calories_kcal,protein_g,carbs_g,fat_g,serving_unit,serving_size").single();
    if (error) return setMessage(error.message);
    if (data) {
      setFoodOptions((current) => current.map((item) => item.id === data.id ? {
        id: data.id,
        ownerId: data.owner_id,
        name: data.name,
        brand: data.brand,
        calories: Number(data.calories_kcal),
        protein: Number(data.protein_g),
        carbs: Number(data.carbs_g),
        fat: Number(data.fat_g),
        unit: data.serving_unit,
        servingSize: Number(data.serving_size ?? 100),
        source: (data.source as FoodSource) ?? "user",
        per100g: data.serving_unit === "g" && Number(data.serving_size ?? 100) === 100
      } : item).sort((a, b) => a.name.localeCompare(b.name)));
    }
    cancelEditFood();
    setMessage("Alimento atualizado na sua base.");
  }

  async function deleteFoodBase(id: string) {
    if (!isCloud) return;
    if (!window.confirm("Excluir este alimento da sua base? Os registros antigos do diário serão mantidos.")) return;
    const { error } = await supabase!.from("foods").delete().eq("id", id);
    if (error) return setMessage(error.message);
    setFoodOptions((current) => current.filter((item) => item.id !== id));
    if (editingFoodId === id) cancelEditFood();
    setMessage("Alimento excluído da sua base.");
  }


  function prepareMealTemplate(meal: Meal, entries: FoodEntry[]) {
    if (!entries.length) return setMessage("Adicione alimentos nessa refeição antes de salvar.");
    setSavedMealForm({ name: mealLabels[meal], meal });
    document.getElementById("saved-meals")?.scrollIntoView({ behavior: "smooth", block: "start" });
    setMessage(`Revise o nome e clique em Criar refeição para salvar ${entries.length} item(ns).`);
  }

  async function createSavedMeal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isCloud) return setMessage("Entre na conta para salvar refeições no Supabase.");
    if (!savedMealForm.name.trim()) return setMessage("Informe um nome para a refeição salva.");
    const entries = state.foodEntries.filter((entry) => entry.meal === savedMealForm.meal);
    if (!entries.length) return setMessage(`Não há alimentos em ${mealLabels[savedMealForm.meal]} na data atual.`);
    const items = entries.map(({ id: _id, ...entry }) => entry);
    const { data, error } = await supabase!.from("saved_meals").insert({
      user_id: session!.user.id,
      name: savedMealForm.name.trim(),
      meal: savedMealForm.meal,
      items
    }).select("id,name,meal,items").single();
    if (error) return setMessage(error.message);
    if (data) {
      setSavedMeals((current) => [{ id: data.id, name: data.name, meal: data.meal as Meal, items: Array.isArray(data.items) ? data.items as Array<Omit<FoodEntry, "id">> : [] }, ...current]);
    }
    setSavedMealForm({ name: "", meal: savedMealForm.meal });
    setMessage(`Refeição "${data?.name ?? "salva"}" criada.`);
  }

  function startEditSavedMeal(savedMeal: SavedMeal) {
    setEditingSavedMealId(savedMeal.id);
    setEditingSavedMealForm({ name: savedMeal.name, meal: savedMeal.meal });
  }

  function cancelEditSavedMeal() {
    setEditingSavedMealId(null);
    setEditingSavedMealForm({ name: "", meal: "lunch" });
  }

  async function updateSavedMeal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isCloud || !editingSavedMealId) return;
    if (!editingSavedMealForm.name.trim()) return setMessage("Informe um nome para a refeição salva.");
    const current = savedMeals.find((item) => item.id === editingSavedMealId);
    const { data, error } = await supabase!.from("saved_meals").update({
      name: editingSavedMealForm.name.trim(),
      meal: editingSavedMealForm.meal,
      items: current?.items ?? []
    }).eq("id", editingSavedMealId).select("id,name,meal,items").single();
    if (error) return setMessage(error.message);
    if (data) {
      setSavedMeals((items) => items.map((item) => item.id === data.id ? { id: data.id, name: data.name, meal: data.meal as Meal, items: Array.isArray(data.items) ? data.items as Array<Omit<FoodEntry, "id">> : [] } : item));
    }
    cancelEditSavedMeal();
    setMessage("Refeição salva atualizada.");
  }

  async function applySavedMeal(savedMeal: SavedMeal) {
    if (!savedMeal.items.length) return setMessage("Essa refeição salva não possui itens.");
    if (isCloud) {
      const payload = savedMeal.items.map((entry) => ({
        user_id: session!.user.id,
        diary_date: selectedDate,
        meal: savedMeal.meal,
        food_name_snapshot: entry.name,
        quantity: entry.quantity,
        unit: entry.unit,
        calories_kcal: entry.calories,
        protein_g: entry.protein,
        carbs_g: entry.carbs,
        fat_g: entry.fat
      }));
      const { data, error } = await supabase!.from("diary_entries").insert(payload).select("id,meal,food_name_snapshot,quantity,unit,calories_kcal,protein_g,carbs_g,fat_g");
      if (error) return setMessage(error.message);
      setState((current) => ({
        ...current,
        foodEntries: [...current.foodEntries, ...(data ?? []).map((entry) => ({
          id: entry.id,
          meal: entry.meal as Meal,
          name: entry.food_name_snapshot,
          quantity: Number(entry.quantity),
          unit: entry.unit,
          calories: Number(entry.calories_kcal),
          protein: Number(entry.protein_g),
          carbs: Number(entry.carbs_g),
          fat: Number(entry.fat_g)
        }))]
      }));
    } else {
      setState((current) => ({
        ...current,
        foodEntries: [...current.foodEntries, ...savedMeal.items.map((entry) => ({ ...entry, id: createId("food"), meal: savedMeal.meal }))]
      }));
    }
    setMessage(`Refeição "${savedMeal.name}" aplicada em ${selectedDate}.`);
  }

  async function deleteSavedMeal(id: string) {
    if (!isCloud) return;
    if (!window.confirm("Excluir esta refeição salva?")) return;
    const { error } = await supabase!.from("saved_meals").delete().eq("id", id);
    if (error) return setMessage(error.message);
    setSavedMeals((current) => current.filter((item) => item.id !== id));
    setMessage("Refeição salva excluída.");
  }
  async function copyYesterdayDiary() {
    const sourceDate = addDays(selectedDate, -1);
    if (isCloud) {
      const { data, error } = await supabase!.from("diary_entries").select("meal,food_name_snapshot,quantity,unit,calories_kcal,protein_g,carbs_g,fat_g").eq("diary_date", sourceDate).order("created_at");
      if (error) return setMessage(error.message);
      if (!data?.length) return setMessage(`Nenhum alimento encontrado em ${sourceDate} para copiar.`);
      const payload = data.map((entry) => ({
        user_id: session!.user.id,
        diary_date: selectedDate,
        meal: entry.meal,
        food_name_snapshot: entry.food_name_snapshot,
        quantity: entry.quantity,
        unit: entry.unit,
        calories_kcal: entry.calories_kcal,
        protein_g: entry.protein_g,
        carbs_g: entry.carbs_g,
        fat_g: entry.fat_g
      }));
      const { data: inserted, error: insertError } = await supabase!.from("diary_entries").insert(payload).select("id,meal,food_name_snapshot,quantity,unit,calories_kcal,protein_g,carbs_g,fat_g");
      if (insertError) return setMessage(insertError.message);
  
    setState((current) => ({
        ...current,
        foodEntries: [...current.foodEntries, ...(inserted ?? []).map((entry) => ({
          id: entry.id,
          meal: entry.meal as Meal,
          name: entry.food_name_snapshot,
          quantity: Number(entry.quantity),
          unit: entry.unit,
          calories: Number(entry.calories_kcal),
          protein: Number(entry.protein_g),
          carbs: Number(entry.carbs_g),
          fat: Number(entry.fat_g)
        }))]
      }));
      setMessage(`${data.length} alimento(s) copiados de ${sourceDate}.`);
      return;
    }

    if (!state.foodEntries.length) return setMessage("No modo local, carregue primeiro um dia com alimentos para duplicar.");
    const copied = state.foodEntries.map((entry) => ({ ...entry, id: createId("food") }));

    setState((current) => ({ ...current, foodEntries: [...current.foodEntries, ...copied] }));
    setMessage(`${copied.length} alimento(s) duplicados no diário local.`);
  }
  function selectFoodCategory(categoryId: FoodCategory | "all") {
    setActiveFoodCategory(categoryId);
    if (categoryId === "all") {
      setExternalFoodQuery("");
      setMessage("Mostrando todas as opções de busca.");
      return;
    }
    const category = foodCategories.find((item) => item.id === categoryId);
    if (!category) return;
    setExternalFoodQuery(category.query);
    setMessage(`Categoria ${category.label} selecionada. Clique em Buscar ou escolha uma sugestão.`);
  }

  function chooseCategorySuggestion(name: string) {
    setExternalFoodQuery(name);
    setFoodForm((current) => ({ ...current, name, quantity: "100", unit: "g" }));
    setMessage(`Sugestão carregada: ${name}. Clique em Buscar para trazer valores da base ampliada.`);
  }

  function startEditDiaryEntry(entry: FoodEntry) {
    setSelectedPer100gFood(null);
    setEditingDiaryEntryId(entry.id);
    setDiaryEditForm({
      meal: entry.meal,
      name: entry.name,
      quantity: String(entry.quantity),
      unit: entry.unit,
      calories: String(entry.calories),
      protein: String(entry.protein),
      carbs: String(entry.carbs),
      fat: String(entry.fat)
    });
  }

  function cancelEditDiaryEntry() {
    setEditingDiaryEntryId(null);
    setDiaryEditForm({ meal: "lunch", name: "", quantity: "1", unit: "porção", calories: "", protein: "", carbs: "", fat: "" });
  }

  async function updateDiaryEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingDiaryEntryId) return;
    if (!diaryEditForm.name.trim() || !diaryEditForm.calories) return setMessage("Preencha nome e calorias para atualizar o item.");
    const updated: FoodEntry = {
      id: editingDiaryEntryId,
      meal: diaryEditForm.meal,
      name: diaryEditForm.name.trim(),
      quantity: Number(diaryEditForm.quantity) || 1,
      unit: diaryEditForm.unit.trim() || "porção",
      calories: Number(diaryEditForm.calories) || 0,
      protein: Number(diaryEditForm.protein) || 0,
      carbs: Number(diaryEditForm.carbs) || 0,
      fat: Number(diaryEditForm.fat) || 0
    };

    if (isCloud) {
      const { error } = await supabase!.from("diary_entries").update({
        meal: updated.meal,
        quantity: updated.quantity,
        unit: updated.unit,
        calories_kcal: updated.calories,
        protein_g: updated.protein,
        carbs_g: updated.carbs,
        fat_g: updated.fat,
        food_name_snapshot: updated.name
      }).eq("id", editingDiaryEntryId);
      if (error) return setMessage(error.message);
    }

    setState((current) => ({ ...current, foodEntries: current.foodEntries.map((entry) => entry.id === editingDiaryEntryId ? updated : entry) }));
    cancelEditDiaryEntry();
    setMessage(`Item atualizado: ${updated.name}.`);
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

  const activeFastingSession = fastingSessions.find((sessionItem) => sessionItem.status === "active");
  const fastingElapsed = activeFastingSession ? formatDuration(nowTick - new Date(activeFastingSession.startedAt).getTime()) : "0h 00min";
  const fastingRemaining = activeFastingSession ? formatDuration(new Date(activeFastingSession.targetEndAt).getTime() - nowTick) : formatDuration(fastingGuidance.fastingHours * 60 * 60 * 1000);
  const fastingProgress = activeFastingSession ? Math.min(100, Math.round(((nowTick - new Date(activeFastingSession.startedAt).getTime()) / Math.max(1, new Date(activeFastingSession.targetEndAt).getTime() - new Date(activeFastingSession.startedAt).getTime())) * 100)) : 0;
  const waterTarget = 2500;
  const visualWaterProgress = Math.min(100, Math.round((totals.water / waterTarget) * 100));
  const macroVisuals = [
    { label: "Proteína", value: Math.round(totals.protein), target: goalTargets.protein, color: "#16a34a" },
    { label: "Carboidratos", value: Math.round(totals.carbs), target: goalTargets.carbs, color: "#0066ee" },
    { label: "Gorduras", value: Math.round(totals.fat), target: goalTargets.fat, color: "#ff7a59" }
  ];

  async function startFastingSession() {
    if (activeFastingSession) return setMessage("Já existe um jejum em andamento.");
    const startedAt = new Date();
    const targetEndAt = addHoursToDate(startedAt, fastingGuidance.fastingHours);
    const localSession: FastingSession = { id: createId("fasting"), startedAt: startedAt.toISOString(), targetEndAt: targetEndAt.toISOString(), status: "active" };
    if (isCloud) {
      const { data, error } = await supabase!.from("fasting_sessions").insert({ user_id: session!.user.id, plan_id: state.fastingPlan.id ?? null, started_at: localSession.startedAt, target_end_at: localSession.targetEndAt, status: "active" }).select("id,started_at,ended_at,target_end_at,status").single();
      if (error) return setMessage(error.message);
      if (data) localSession.id = data.id;
    }
    setFastingSessions((current) => [localSession, ...current]);
    setMessage(`Jejum iniciado. Meta de término: ${formatDateTime(localSession.targetEndAt)}.`);
  }

  async function finishFastingSession() {
    if (!activeFastingSession) return setMessage("Não há jejum ativo para encerrar.");
    const endedAt = new Date().toISOString();
    if (isCloud) {
      const { error } = await supabase!.from("fasting_sessions").update({ ended_at: endedAt, status: "completed" }).eq("id", activeFastingSession.id);
      if (error) return setMessage(error.message);
    }
    setFastingSessions((current) => current.map((item) => item.id === activeFastingSession.id ? { ...item, endedAt, status: "completed" } : item));
    setMessage(`Jejum encerrado com ${formatDuration(new Date(endedAt).getTime() - new Date(activeFastingSession.startedAt).getTime())}.`);
  }
  function resetDemo() {
    window.localStorage.removeItem("nutricao-fitness-state");
    setState(defaultState);
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><Flame size={20} /></span>Nutrição & Fitness</div>
        <nav className="nav" aria-label="Navegação principal">
          <a className="active" href="#today"><Utensils size={18} /> Hoje</a>
          <a href="#food"><Search size={18} /> Registrar</a>
          <a href="#reports"><BarChart3 size={18} /> Relatórios</a>
          <a href="#saved-meals"><ClipboardList size={18} /> Refeições</a>
          <a href="#my-foods"><ClipboardList size={18} /> Minha base</a>{isAdmin ? <a href="#admin-foods"><ShieldCheck size={18} /> Admin</a> : null}
          <a href="#fasting"><Clock3 size={18} /> Jejum</a>
          <a href="#progress"><Scale size={18} /> Peso</a>
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

        <section className="date-panel card analytics-toolbar">
          <label className="field date-field">Data do diário<input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /></label>
          <div className="toolbar-insights" aria-label="Contexto do painel">
            <span><strong>{selectedDate}</strong><small>Período ativo</small></span>
            <span><strong>{isCloud ? "Supabase" : "Local"}</strong><small>Origem dos dados</small></span>
            <span><strong>{state.foodEntries.length}</strong><small>Itens registrados</small></span>
          </div>
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

        <section className="overview-panel card" aria-label="Visão geral analítica">
          <div>
            <div className="card-title"><BarChart3 size={16} /> Visão geral</div>
            <h2>Score do dia: {dashboardScore}/100</h2>
            <p className="muted compact">{nextAction}</p>
          </div>
          <div className="overview-metrics">
            <span><strong>{calorieStatus}</strong><small>Calorias</small></span>
            <span><strong>{proteinProgress}%</strong><small>Proteína</small></span>
            <span><strong>{waterProgress}%</strong><small>Hidratação</small></span>
            <span><strong>{reportAdherence}%</strong><small>Aderência semanal</small></span>
          </div>
        </section>
        <section className="visual-dashboard card" aria-label="Painel visual de indicadores">
          <div className="visual-hero">
            <div className="ring-card calories-ring" style={{ "--value": calorieProgress, "--ring-color": "linear-gradient(135deg, #16a34a, #00b8ff)" } as CSSProperties}>
              <div className="ring-core"><span>Calorias</span><strong>{totals.consumed}</strong><small>de {state.calorieTarget} kcal</small></div>
            </div>
            <div className="visual-copy">
              <div className="card-title"><BarChart3 size={16} /> Indicadores do dia</div>
              <h2>{remaining >= 0 ? String(remaining) + " kcal restantes" : String(Math.abs(remaining)) + " kcal acima da meta"}</h2>
              <p className="muted compact">Acompanhe calorias, macros, água e jejum com leitura rápida em círculos, como um painel de saúde diário.</p>
              <div className="visual-badges"><span>{dashboardScore}/100 score</span><span>{calorieStatus}</span><span>{isCloud ? "Sincronizado" : "Local"}</span></div>
            </div>
          </div>
          <div className="visual-grid">
            {macroVisuals.map((macro) => <div className="mini-ring-card" key={macro.label}><div className="mini-ring" style={{ "--value": Math.min(100, Math.round((macro.value / Math.max(1, macro.target)) * 100)), "--ring-color": macro.color } as CSSProperties}><strong>{macro.value}g</strong></div><span>{macro.label}</span><small>meta {macro.target}g</small></div>)}
            <div className="water-infographic"><div><div className="card-title"><Droplets size={16} /> Água</div><strong>{(totals.water / 1000).toFixed(1)} L</strong><small>meta {(waterTarget / 1000).toFixed(1)} L</small></div><div className="water-drops" aria-label={String(visualWaterProgress) + "% da meta de água"}>{Array.from({ length: 8 }).map((_, index) => <span key={index} className={index < Math.round((visualWaterProgress / 100) * 8) ? "filled" : ""}>●</span>)}</div></div>
            <div className="mini-ring-card fasting-mini"><div className="mini-ring" style={{ "--value": fastingProgress, "--ring-color": "#16a34a" } as CSSProperties}><strong>{activeFastingSession ? fastingElapsed : String(fastingGuidance.fastingHours) + "h"}</strong></div><span>Jejum</span><small>{activeFastingSession ? "em andamento" : "planejado"}</small></div>
          </div>
        </section>
        <section className="grid" aria-label="Resumo do dia">
          <article className="card stat-card span-3"><div className="card-title"><Flame size={16} /> Calorias restantes</div><div className="metric">{remaining}<small> kcal</small></div><div className="progress"><span style={{ width: `${Math.min(100, Math.round((totals.consumed / state.calorieTarget) * 100))}%`, background: "var(--green)" }} /></div></article>
          <article className="card stat-card span-3"><div className="card-title"><Utensils size={16} /> Consumidas</div><div className="metric">{totals.consumed}<small> kcal</small></div><p className="muted">Meta: {state.calorieTarget} kcal</p></article>
          <article className="card stat-card span-3"><div className="card-title"><Droplets size={16} /> Água</div><div className="metric">{(totals.water / 1000).toFixed(1)}<small> L</small></div><div className="progress"><span style={{ width: `${Math.min(100, Math.round((totals.water / 2500) * 100))}%`, background: "var(--blue)" }} /></div></article>
          <article className="card stat-card span-3"><div className="card-title"><Dumbbell size={16} /> Exercícios</div><div className="metric">{totals.exercise}<small> kcal</small></div><p className="muted">Crédito configurável no diário.</p></article>

          <article className="card span-7"><div className="section-heading"><div className="card-title"><ClipboardList size={16} /> Diário da data</div><button className="secondary-action small-action" type="button" onClick={copyYesterdayDiary}>Copiar ontem</button></div><div className="meals">{(Object.keys(mealLabels) as Meal[]).map((meal) => { const entries = state.foodEntries.filter((entry) => entry.meal === meal); const kcal = entries.reduce((sum, entry) => sum + entry.calories, 0); return <div className="meal-block" key={meal}><div className="meal-row meal-total"><div className="meal-name">{mealLabels[meal]}</div><div className="meal-actions"><div className="kcal">{kcal} kcal</div>{entries.length ? <button className="secondary-action tiny-action" type="button" onClick={() => prepareMealTemplate(meal, entries)}>Salvar refeição</button> : null}</div></div>{entries.length === 0 ? <p className="muted compact">Nenhum item registrado.</p> : null}{entries.map((entry) => editingDiaryEntryId === entry.id ? <form className="diary-edit-form" key={entry.id} onSubmit={updateDiaryEntry}><label className="field wide">Alimento<input value={diaryEditForm.name} onChange={(event) => setDiaryEditForm({ ...diaryEditForm, name: event.target.value })} /></label><label className="field">Refeição<select value={diaryEditForm.meal} onChange={(event) => setDiaryEditForm({ ...diaryEditForm, meal: event.target.value as Meal })}>{Object.entries(mealLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="field">Qtd.<input type="number" value={diaryEditForm.quantity} onChange={(event) => setDiaryEditForm({ ...diaryEditForm, quantity: event.target.value })} /></label><label className="field">Unidade<input value={diaryEditForm.unit} onChange={(event) => setDiaryEditForm({ ...diaryEditForm, unit: event.target.value })} /></label><label className="field">Kcal<input type="number" value={diaryEditForm.calories} onChange={(event) => setDiaryEditForm({ ...diaryEditForm, calories: event.target.value })} /></label><label className="field">Proteína<input type="number" value={diaryEditForm.protein} onChange={(event) => setDiaryEditForm({ ...diaryEditForm, protein: event.target.value })} /></label><label className="field">Carbo.<input type="number" value={diaryEditForm.carbs} onChange={(event) => setDiaryEditForm({ ...diaryEditForm, carbs: event.target.value })} /></label><label className="field">Gord.<input type="number" value={diaryEditForm.fat} onChange={(event) => setDiaryEditForm({ ...diaryEditForm, fat: event.target.value })} /></label><button className="primary-action" type="submit">Salvar</button><button className="secondary-action" type="button" onClick={cancelEditDiaryEntry}>Cancelar</button></form> : <div className="entry-row" key={entry.id}><div><div>{entry.name}</div><div className="meal-food">{entry.quantity} {entry.unit} · P {entry.protein}g · C {entry.carbs}g · G {entry.fat}g</div></div><div className="entry-actions"><button className="icon-button" type="button" onClick={() => startEditDiaryEntry(entry)} aria-label={`Editar ${entry.name}`}><Pencil size={16} /></button><button className="icon-button" type="button" onClick={() => deleteFood(entry.id)} aria-label={`Remover ${entry.name}`}><Trash2 size={16} /></button></div></div>)}</div>; })}</div></article>

          <article className="card span-5"><div className="card-title"><Beef size={16} /> Macros</div><div className="macro-grid"><div className="macro"><span>Proteína</span><strong style={{ color: "var(--green)" }}>{totals.protein}g</strong><small>meta {goalTargets.protein}g</small></div><div className="macro"><span>Carboidratos</span><strong style={{ color: "var(--blue)" }}>{totals.carbs}g</strong><small>meta {goalTargets.carbs}g</small></div><div className="macro"><span>Gorduras</span><strong style={{ color: "var(--coral)" }}>{totals.fat}g</strong><small>meta {goalTargets.fat}g</small></div></div><label className="field solo">Meta calórica diária<input type="number" value={state.calorieTarget} onChange={(event) => setState((current) => ({ ...current, calorieTarget: Number(event.target.value) || 0, fastingPlan: { ...current.fastingPlan, calorieTarget: Number(event.target.value) || 0 } }))} /></label></article>


          <article className="card span-12" id="reports"><div className="section-heading"><div className="card-title"><BarChart3 size={16} /> Histórico e relatórios</div><div className="range-tabs" aria-label="Período do relatório">{([7, 15, 30] as const).map((days) => <button className={reportRange === days ? "range-tab active" : "range-tab"} type="button" key={days} onClick={() => setReportRange(days)}>{days} dias</button>)}</div></div><div className="report-summary"><div><span>Média kcal</span><strong>{reportAverageCalories}</strong><small>meta {state.calorieTarget} kcal</small></div><div><span>Aderência</span><strong>{reportAdherence}%</strong><small>{reportTotals.adherentDays}/{reportCount} dias dentro da faixa</small></div><div><span>Água média</span><strong>{(reportAverageWater / 1000).toFixed(1)} L</strong><small>por dia</small></div><div><span>Peso</span><strong>{latestWeight ? `${latestWeight.weightKg} kg` : "-"}</strong><small>{weightDelta === null ? "sem comparação" : `${weightDelta > 0 ? "+" : ""}${weightDelta} kg vs. anterior`}</small></div></div><div className="report-bars">{reportSource.map((day) => <div className="report-day" key={day.date}><div className="report-date">{shortDateLabel(day.date)}</div><div className="report-bar"><span style={{ height: `${Math.max(4, Math.round((day.calories / maxReportCalories) * 100))}%` }} /></div><div className="report-kcal">{Math.round(day.calories)} kcal</div><small>P {Math.round(day.protein)}g · C {Math.round(day.carbs)}g · G {Math.round(day.fat)}g</small></div>)}</div><div className="follow-up-box"><div className="result-heading"><strong>Resumo para acompanhamento</strong><button className="secondary-action" type="button" onClick={copyFollowUpSummary}>Copiar resumo</button></div><textarea readOnly value={followUpSummary} /></div><p className="muted compact">Resumo educativo dos últimos {reportCount} dia(s). Dias sem registro aparecem zerados; quanto mais completo o diário, melhor o relatório.</p></article>
          <article className="card span-12" id="food"><div className="card-title"><Search size={16} /> Registrar alimento</div><div className="category-panel"><div className="category-tabs"><button className={activeFoodCategory === "all" ? "category-tab active" : "category-tab"} type="button" onClick={() => selectFoodCategory("all")}>Todos</button>{foodCategories.map((category) => <button className={activeFoodCategory === category.id ? "category-tab active" : "category-tab"} type="button" key={category.id} onClick={() => selectFoodCategory(category.id)}>{category.label}</button>)}</div>{activeFoodCategory !== "all" ? <div className="category-suggestions">{foodCategories.find((category) => category.id === activeFoodCategory)?.items.map((item) => <button className="quick-chip" type="button" key={item} onClick={() => chooseCategorySuggestion(item)}>{item}</button>)}</div> : <p className="muted compact">Escolha uma categoria para ver sugestões rápidas ou digite livremente na busca.</p>}</div><form className="external-food-search" onSubmit={searchExternalFoods}><input value={externalFoodQuery} onChange={(event) => setExternalFoodQuery(event.target.value)} placeholder="Buscar na base ampliada: iogurte, arroz, pão integral..." /><button className="secondary-action" type="submit"><Search size={18} /> Buscar</button></form><div className="quick-picks"><div><strong>Refeições salvas</strong><span>Modelos com vários itens</span></div>{savedMeals.length ? <div className="quick-chip-list">{savedMeals.map((item) => <button className="quick-chip meal-chip" type="button" key={item.id} onClick={() => applySavedMeal(item)}>{item.name}<small>{mealLabels[item.meal]} · {item.items.length} item(ns)</small></button>)}</div> : <p className="muted compact">Nenhuma refeição salva ainda.</p>}</div><div className="quick-picks"><div><strong>Recentes</strong><span>Itens já usados nesta data</span></div>{recentFoods.length ? <div className="quick-chip-list">{recentFoods.map((entry) => <button className="quick-chip" type="button" key={entry.id} onClick={() => chooseRecentFood(entry)}>{entry.name}<small>{entry.calories} kcal</small></button>)}</div> : <p className="muted compact">Sem recentes nesta data.</p>}</div>{myFoodOptions.length ? <div className="quick-picks"><div><strong>Favoritos salvos</strong><span>Sua base pessoal</span></div><div className="quick-chip-list">{myFoodOptions.slice(0, 8).map((item) => <button className="quick-chip" type="button" key={item.id} onClick={() => chooseFoodOption(item.id)}>{item.name}<small>{item.calories} kcal</small></button>)}</div></div> : null}{externalFoods.length ? <div className="external-results">{externalFoods.map((item) => <button className="external-result" type="button" key={`${item.code}-${item.name}`} onClick={() => chooseExternalFood(item)}><div className="result-heading"><strong>{item.name}</strong><em>{foodSourceLabel(item.source)}</em></div><span>{item.brand || foodSourceLabel(item.source)} · {Math.round(item.calories_kcal_100g)} kcal/100g · P {item.protein_g_100g}g · C {item.carbs_g_100g}g · G {item.fat_g_100g}g</span></button>)}</div> : null}{foodOptions.length ? <label className="field solo">Alimentos do Supabase<select defaultValue="" onChange={(event) => chooseFoodOption(event.target.value)}><option value="" disabled>Selecionar alimento da base</option>{foodOptions.map((item) => <option key={item.id} value={item.id}>{item.name}{item.brand ? ` - ${item.brand}` : ""} · {foodSourceLabel(item.source)}</option>)}</select></label> : null}<form className="form-grid" onSubmit={addFood}><label className="field wide">Alimento<input value={foodForm.name} onChange={(event) => { setSelectedPer100gFood(null); setFoodForm({ ...foodForm, name: event.target.value }); }} placeholder="Ex.: arroz, feijão e frango" /></label><label className="field">Refeição<select value={foodForm.meal} onChange={(event) => setFoodForm({ ...foodForm, meal: event.target.value as Meal })}>{Object.entries(mealLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="field">Qtd.<input type="number" value={foodForm.quantity} onChange={(event) => { setFoodForm({ ...foodForm, quantity: event.target.value }); if (selectedPer100gFood) applyPer100gFood(selectedPer100gFood, Number(event.target.value)); }} /></label><label className="field">Unidade<input value={foodForm.unit} onChange={(event) => { setSelectedPer100gFood(null); setFoodForm({ ...foodForm, unit: event.target.value }); }} /></label><label className="field">Kcal<input type="number" value={foodForm.calories} onChange={(event) => setFoodForm({ ...foodForm, calories: event.target.value })} /></label><label className="field">Proteína g<input type="number" value={foodForm.protein} onChange={(event) => setFoodForm({ ...foodForm, protein: event.target.value })} /></label><label className="field">Carbo. g<input type="number" value={foodForm.carbs} onChange={(event) => setFoodForm({ ...foodForm, carbs: event.target.value })} /></label><label className="field">Gord. g<input type="number" value={foodForm.fat} onChange={(event) => setFoodForm({ ...foodForm, fat: event.target.value })} /></label><button className="primary-action" type="submit"><Plus size={18} /> Adicionar</button><button className="secondary-action" type="button" onClick={saveCustomFood}>Salvar na base</button></form></article>


          
                    <article className="card span-12" id="saved-meals"><div className="card-title"><ClipboardList size={16} /> Refeições salvas</div><p className="muted">Modelos de refeições completas para aplicar em qualquer data.</p>{!isCloud ? <p className="muted compact">Entre na conta para salvar modelos no Supabase.</p> : <form className="saved-meal-form" onSubmit={createSavedMeal}><label className="field wide">Nome da refeição<input value={savedMealForm.name} onChange={(event) => setSavedMealForm({ ...savedMealForm, name: event.target.value })} placeholder="Ex.: Almoço marmita" /></label><label className="field">Refeição base<select value={savedMealForm.meal} onChange={(event) => setSavedMealForm({ ...savedMealForm, meal: event.target.value as Meal })}>{Object.entries(mealLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button className="primary-action" type="submit">Criar refeição</button></form>}{savedMeals.length === 0 ? <p className="muted compact">Use o botão Salvar refeição no Diário da data ou preencha o formulário acima para criar seu primeiro modelo.</p> : <div className="food-base-list">{savedMeals.map((item) => <div className="food-base-item" key={item.id}>{editingSavedMealId === item.id ? <form className="saved-meal-form" onSubmit={updateSavedMeal}><label className="field wide">Nome<input value={editingSavedMealForm.name} onChange={(event) => setEditingSavedMealForm({ ...editingSavedMealForm, name: event.target.value })} /></label><label className="field">Refeição<select value={editingSavedMealForm.meal} onChange={(event) => setEditingSavedMealForm({ ...editingSavedMealForm, meal: event.target.value as Meal })}>{Object.entries(mealLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button className="primary-action" type="submit">Salvar edição</button><button className="secondary-action" type="button" onClick={cancelEditSavedMeal}>Cancelar</button></form> : <><div><div className="result-heading"><strong>{item.name}</strong><em>{mealLabels[item.meal]}</em></div><p className="muted compact">{item.items.length} item(ns) · {item.items.reduce((sum, entry) => sum + entry.calories, 0)} kcal</p></div><div className="food-base-actions"><button className="secondary-action" type="button" onClick={() => applySavedMeal(item)}>Aplicar</button><button className="secondary-action" type="button" onClick={() => startEditSavedMeal(item)}>Editar</button><button className="icon-button" type="button" onClick={() => deleteSavedMeal(item.id)} aria-label={`Excluir ${item.name}`}><Trash2 size={16} /></button></div></>}</div>)}</div>}</article><article className="card span-12" id="my-foods"><div className="card-title"><ClipboardList size={16} /> Minha base</div><p className="muted">Alimentos salvos por você no Supabase para reutilizar, editar ou excluir.</p>{!isCloud ? <p className="muted compact">Entre na conta para gerenciar sua base pessoal.</p> : myFoodOptions.length === 0 ? <p className="muted compact">Nenhum alimento salvo ainda. Busque um alimento, ajuste a quantidade e clique em Salvar na base.</p> : <div className="food-base-list">{myFoodOptions.map((item) => <div className="food-base-item" key={item.id}>{editingFoodId === item.id ? <form className="food-base-edit" onSubmit={updateFoodBase}><label className="field wide">Nome<input value={foodBaseForm.name} onChange={(event) => setFoodBaseForm({ ...foodBaseForm, name: event.target.value })} /></label><label className="field">Marca<input value={foodBaseForm.brand} onChange={(event) => setFoodBaseForm({ ...foodBaseForm, brand: event.target.value })} /></label><label className="field">Porção<input type="number" step="0.1" value={foodBaseForm.servingSize} onChange={(event) => setFoodBaseForm({ ...foodBaseForm, servingSize: event.target.value })} /></label><label className="field">Unidade<input value={foodBaseForm.unit} onChange={(event) => setFoodBaseForm({ ...foodBaseForm, unit: event.target.value })} /></label><label className="field">Kcal<input type="number" step="0.1" value={foodBaseForm.calories} onChange={(event) => setFoodBaseForm({ ...foodBaseForm, calories: event.target.value })} /></label><label className="field">Proteína<input type="number" step="0.1" value={foodBaseForm.protein} onChange={(event) => setFoodBaseForm({ ...foodBaseForm, protein: event.target.value })} /></label><label className="field">Carbo.<input type="number" step="0.1" value={foodBaseForm.carbs} onChange={(event) => setFoodBaseForm({ ...foodBaseForm, carbs: event.target.value })} /></label><label className="field">Gord.<input type="number" step="0.1" value={foodBaseForm.fat} onChange={(event) => setFoodBaseForm({ ...foodBaseForm, fat: event.target.value })} /></label><button className="primary-action" type="submit">Salvar edição</button><button className="secondary-action" type="button" onClick={cancelEditFood}>Cancelar</button></form> : <><div><div className="result-heading"><strong>{item.name}</strong><em>{foodSourceLabel(item.source)}</em></div><p className="muted compact">{item.brand ? `${item.brand} · ` : ""}{item.calories} kcal/{item.servingSize ?? 100}{item.unit} · P {item.protein}g · C {item.carbs}g · G {item.fat}g</p></div><div className="food-base-actions"><button className="secondary-action" type="button" onClick={() => chooseFoodOption(item.id)}>Usar</button><button className="secondary-action" type="button" onClick={() => startEditFood(item)}>Editar</button><button className="icon-button" type="button" onClick={() => deleteFoodBase(item.id)} aria-label={`Excluir ${item.name}`}><Trash2 size={16} /></button></div></>}</div>)}</div>}</article>
          {isAdmin ? <article className="card span-12" id="admin-foods"><div className="card-title"><ShieldCheck size={16} /> Admin da base de alimentos</div><p className="muted">Cadastre alimentos globais que aparecem para todos os usuários. Use valores por porção, preferencialmente por 100g quando a unidade for grama.</p><form className="food-base-edit admin-food-form" onSubmit={saveAdminFood}><label className="field wide">Nome<input value={adminFoodForm.name} onChange={(event) => setAdminFoodForm({ ...adminFoodForm, name: event.target.value })} placeholder="Ex.: Pizza portuguesa" /></label><label className="field">Marca/Fonte<input value={adminFoodForm.brand} onChange={(event) => setAdminFoodForm({ ...adminFoodForm, brand: event.target.value })} /></label><label className="field">Porção<input type="number" step="0.1" value={adminFoodForm.servingSize} onChange={(event) => setAdminFoodForm({ ...adminFoodForm, servingSize: event.target.value })} /></label><label className="field">Unidade<input value={adminFoodForm.unit} onChange={(event) => setAdminFoodForm({ ...adminFoodForm, unit: event.target.value })} /></label><label className="field">Kcal<input type="number" step="0.1" value={adminFoodForm.calories} onChange={(event) => setAdminFoodForm({ ...adminFoodForm, calories: event.target.value })} /></label><label className="field">Proteína<input type="number" step="0.1" value={adminFoodForm.protein} onChange={(event) => setAdminFoodForm({ ...adminFoodForm, protein: event.target.value })} /></label><label className="field">Carbo.<input type="number" step="0.1" value={adminFoodForm.carbs} onChange={(event) => setAdminFoodForm({ ...adminFoodForm, carbs: event.target.value })} /></label><label className="field">Gord.<input type="number" step="0.1" value={adminFoodForm.fat} onChange={(event) => setAdminFoodForm({ ...adminFoodForm, fat: event.target.value })} /></label><button className="primary-action" type="submit"><Plus size={18} /> Adicionar global</button></form>{adminDuplicateFood ? <p className="duplicate-warning">Possível duplicado: {adminDuplicateFood.name} já existe na base global.</p> : null}<div className="admin-tools"><label className="field wide">Buscar global<input value={adminFoodSearch} onChange={(event) => setAdminFoodSearch(event.target.value)} placeholder="Filtrar por nome ou fonte" /></label><label className="field">Fonte<select value={adminSourceFilter} onChange={(event) => setAdminSourceFilter(event.target.value as "all" | FoodSource)}><option value="all">Todas</option><option value="base_comum">Base comum</option><option value="supabase">Supabase</option><option value="open_food_facts">Open Food Facts</option><option value="user">Usuário</option></select></label></div><div className="admin-summary"><strong>{filteredGlobalFoodOptions.length}</strong><span>de {globalFoodOptions.length} alimento(s) globais</span></div>{filteredGlobalFoodOptions.length ? <div className="food-base-list">{filteredGlobalFoodOptions.slice(0, 30).map((item) => <div className="food-base-item" key={item.id}>{editingAdminFoodId === item.id ? <form className="food-base-edit admin-food-form" onSubmit={updateAdminFood}><label className="field wide">Nome<input value={adminEditForm.name} onChange={(event) => setAdminEditForm({ ...adminEditForm, name: event.target.value })} /></label><label className="field">Marca/Fonte<input value={adminEditForm.brand} onChange={(event) => setAdminEditForm({ ...adminEditForm, brand: event.target.value })} /></label><label className="field">Porção<input type="number" step="0.1" value={adminEditForm.servingSize} onChange={(event) => setAdminEditForm({ ...adminEditForm, servingSize: event.target.value })} /></label><label className="field">Unidade<input value={adminEditForm.unit} onChange={(event) => setAdminEditForm({ ...adminEditForm, unit: event.target.value })} /></label><label className="field">Kcal<input type="number" step="0.1" value={adminEditForm.calories} onChange={(event) => setAdminEditForm({ ...adminEditForm, calories: event.target.value })} /></label><label className="field">Proteína<input type="number" step="0.1" value={adminEditForm.protein} onChange={(event) => setAdminEditForm({ ...adminEditForm, protein: event.target.value })} /></label><label className="field">Carbo.<input type="number" step="0.1" value={adminEditForm.carbs} onChange={(event) => setAdminEditForm({ ...adminEditForm, carbs: event.target.value })} /></label><label className="field">Gord.<input type="number" step="0.1" value={adminEditForm.fat} onChange={(event) => setAdminEditForm({ ...adminEditForm, fat: event.target.value })} /></label><button className="primary-action" type="submit">Salvar edição</button><button className="secondary-action" type="button" onClick={cancelEditAdminFood}>Cancelar</button></form> : <><div><div className="result-heading"><strong>{item.name}</strong><em>{foodSourceLabel(item.source)}</em></div><p className="muted compact">{item.brand ? `${item.brand} · ` : ""}{item.calories} kcal/{item.servingSize ?? 100}{item.unit} · P {item.protein}g · C {item.carbs}g · G {item.fat}g</p></div><div className="food-base-actions"><button className="secondary-action" type="button" onClick={() => chooseFoodOption(item.id)}>Usar</button><button className="secondary-action" type="button" onClick={() => startEditAdminFood(item)}>Editar</button><button className="icon-button" type="button" onClick={() => deleteAdminFood(item.id)} aria-label={`Excluir ${item.name}`}><Trash2 size={16} /></button></div></>}</div>)}</div> : null}</article> : null}
          <article className="card span-12 marketing-card" id="marketing"><div className="card-title"><Megaphone size={16} /> Kit PWA e marketing</div><p className="muted">Instale como aplicativo pelo navegador e use as artes abaixo para divulgação.</p><div className="marketing-links"><a className="secondary-action" href="/manifest.webmanifest" target="_blank">Manifest PWA</a><a className="secondary-action" href="/marketing/app-marketing-banner.png" target="_blank">Banner horizontal</a><a className="secondary-action" href="/marketing/app-marketing-square.png" target="_blank">Post quadrado</a><a className="secondary-action" href="/marketing/app-marketing-story.png" target="_blank">Story vertical</a></div></article>
          <article className="card span-4"><div className="card-title"><Droplets size={16} /> Água</div><form className="inline-form" onSubmit={addWater}><input type="number" value={waterAmount} onChange={(event) => setWaterAmount(event.target.value)} /><button className="primary-action" type="submit">ml</button></form></article>
          <article className="card span-4"><div className="card-title"><Dumbbell size={16} /> Exercício</div><form className="stack-form" onSubmit={addExercise}><input value={exerciseForm.name} onChange={(event) => setExerciseForm({ ...exerciseForm, name: event.target.value })} placeholder="Ex.: musculação" /><div className="two-cols"><input type="number" value={exerciseForm.minutes} onChange={(event) => setExerciseForm({ ...exerciseForm, minutes: event.target.value })} placeholder="min" /><input type="number" value={exerciseForm.calories} onChange={(event) => setExerciseForm({ ...exerciseForm, calories: event.target.value })} placeholder="kcal" /></div><button className="primary-action" type="submit"><Plus size={18} /> Adicionar</button></form></article>
          <article className="card span-4" id="progress"><div className="card-title"><Scale size={16} /> Peso</div><form className="inline-form" onSubmit={addWeight}><input type="number" step="0.1" value={weightForm} onChange={(event) => setWeightForm(event.target.value)} placeholder="kg" /><button className="primary-action" type="submit">Salvar</button></form><p className="muted">Na data: {state.weightEntries.find((entry) => entry.date === selectedDate)?.weightKg ?? "-"} kg · Último: {state.weightEntries.at(-1)?.weightKg ?? "-"} kg</p></article>

          <article className="card span-12 fasting-card" id="fasting"><div className="fasting-header"><div><div className="card-title"><Clock3 size={16} /> Plano de jejum intermitente</div><h2>{activeFastingSession ? "Jejum em andamento" : `Protocolo ${state.fastingPlan.protocol}: próxima refeição ${fastingGuidance.nextMeal}`}</h2><p className="muted compact">{activeFastingSession ? `Iniciado em ${formatDateTime(activeFastingSession.startedAt)} · termina em ${formatDateTime(activeFastingSession.targetEndAt)}` : `Última refeição ${state.fastingPlan.lastMeal} · janela alimentar de ${fastingGuidance.eatingWindowHours}h`}</p></div><span className="fasting-pill"><Clock3 size={16} /> {fastingGuidance.fastingHours}h jejum · {fastingGuidance.eatingWindowHours}h alimentação</span></div><div className="fasting-timer"><div><span>Status</span><strong>{activeFastingSession ? "Em jejum" : "Janela livre"}</strong></div><div><span>Decorrido</span><strong>{fastingElapsed}</strong></div><div><span>Restante</span><strong>{fastingRemaining}</strong></div><div className="fasting-actions"><button className="primary-action" type="button" onClick={startFastingSession} disabled={Boolean(activeFastingSession)}>Iniciar jejum</button><button className="secondary-action" type="button" onClick={finishFastingSession} disabled={!activeFastingSession}>Encerrar</button></div></div><div className="progress fasting-progress"><span style={{ width: `${fastingProgress}%`, background: "var(--blue)" }} /></div><div className="fasting-controls"><label className="field">Protocolo<select value={state.fastingPlan.protocol} onChange={(event) => saveFastingPlan({ ...state.fastingPlan, protocol: event.target.value as Protocol })}><option>12:12</option><option>14:10</option><option>16:8</option><option>18:6</option></select></label><label className="field">Última refeição<input type="time" value={state.fastingPlan.lastMeal} onChange={(event) => saveFastingPlan({ ...state.fastingPlan, lastMeal: event.target.value })} /></label><label className="field">Contexto<select value={state.fastingPlan.context} onChange={(event) => saveFastingPlan({ ...state.fastingPlan, context: event.target.value as Context })}><option value="work">Trabalho</option><option value="training">Treino</option><option value="hot_day">Dia quente</option><option value="rest">Repouso</option></select></label></div><div className="fasting-grid"><div><div className="fasting-label">Entre refeições</div><strong>{fastingGuidance.hydration} ml</strong><p>Meta mínima de hidratação entre a última e a próxima refeição.</p></div><div><div className="fasting-label">O que ingerir</div><strong>0 kcal</strong><p>Água, café sem açúcar, chá sem açúcar e eletrólitos sem calorias quando necessário.</p></div><div><div className="fasting-label">Próxima refeição</div><strong>{fastingGuidance.minKcal} a {fastingGuidance.maxKcal} kcal</strong><p>Com pelo menos {fastingGuidance.protein}g de proteína e {fastingGuidance.fiber}g de fibra, ajustando ao restante do diário.</p></div></div>{fastingSessions.length ? <div className="fasting-history"><strong>Histórico recente</strong>{fastingSessions.slice(0, 5).map((item) => <div className="fasting-history-row" key={item.id}><span>{formatDateTime(item.startedAt)}</span><span>{item.status === "active" ? "Em andamento" : `Concluído · ${formatDuration(new Date(item.endedAt ?? item.targetEndAt).getTime() - new Date(item.startedAt).getTime())}`}</span></div>)}</div> : null}<p className="safety-note">Orientação educativa. Gestação, diabetes, histórico de transtorno alimentar, uso de medicação ou sintomas como tontura e tremor exigem avaliação profissional antes de seguir jejum.</p></article>
        </section>
      <footer className="app-footer">
        <span>Nutri??o & Fitness</span>
        <a href={`mailto:${supportEmail}`}>SAC: {supportEmail}</a>
      </footer>
    </main>
    </div>
  );
}

