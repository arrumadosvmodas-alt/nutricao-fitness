import { Ionicons } from "@expo/vector-icons";
import { BarCodeScanner } from "expo-barcode-scanner";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { Session } from "@supabase/supabase-js";

import { findFoodByBarcode, getFastingGuidance, searchFoods, type ApiFood, type BarcodeFood, type FastingGuidance } from "./src/lib/api";
import { hasSupabaseConfig, supabase } from "./src/lib/supabase";

type Screen = "today" | "log" | "scanner" | "fasting" | "progress";
type Meal = "breakfast" | "lunch" | "dinner" | "snack";
type Protocol = "12:12" | "14:10" | "16:8" | "18:6";
type FastContext = "normal" | "training" | "hot_day";

type FoodEntry = { id: string; date: string; meal: Meal; name: string; quantity: number; unit: string; calories: number; protein: number; carbs: number; fat: number };
type WaterEntry = { id: string; date: string; amountMl: number };
type ExerciseEntry = { id: string; date: string; name: string; minutes: number; calories: number };
type WeightEntry = { id: string; date: string; weightKg: number };
type FastingSession = { id: string; protocol: Protocol; startedAt: string; endedAt?: string; targetEndAt?: string; status?: "active" | "completed" | "cancelled" };
type SavedMeal = { id: string; name: string; meal: Meal; items: Array<Omit<FoodEntry, "id" | "date">> };
type StoredState = { foods: FoodEntry[]; water: WaterEntry[]; exercises: ExerciseEntry[]; weights: WeightEntry[]; fasting: FastingSession[] };

const mealLabels: Record<Meal, string> = { breakfast: "Café", lunch: "Almoço", dinner: "Jantar", snack: "Lanche" };
const protocolHours: Record<Protocol, number> = { "12:12": 12, "14:10": 14, "16:8": 16, "18:6": 18 };
const todayIso = () => new Date().toISOString().slice(0, 10);
const storageKey = (email?: string) => `nutricao-fitness-mobile:${email || "local"}`;
const emptyFoodForm = { meal: "lunch" as Meal, name: "", quantity: "100", unit: "g", calories: "", protein: "", carbs: "", fat: "" };
const emptyState: StoredState = { foods: [], water: [], exercises: [], weights: [], fasting: [] };

function brDate(date: string) {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

function parseBrDate(value: string) {
  const trimmed = value.trim();
  const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  return trimmed;
}

function addDays(date: string, delta: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + delta);
  return value.toISOString().slice(0, 10);
}

function numberText(value: number, decimals = 0) {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
}

function parseAmount(value: string) {
  return Number(value.replace(",", ".")) || 0;
}

function nutritionFromForm(form: typeof emptyFoodForm) {
  const quantity = parseAmount(form.quantity) || 100;
  const unit = form.unit.trim() || "g";
  const factor = unit.toLowerCase() === "g" || unit.toLowerCase() === "ml" ? quantity / 100 : 1;
  return {
    quantity,
    unit,
    calories: Math.round(parseAmount(form.calories) * factor),
    protein: Math.round(parseAmount(form.protein) * factor * 10) / 10,
    carbs: Math.round(parseAmount(form.carbs) * factor * 10) / 10,
    fat: Math.round(parseAmount(form.fat) * factor * 10) / 10
  };
}

function per100(value: number, quantity: number, unit: string) {
  const normalizedQuantity = quantity || 100;
  const factor = unit.toLowerCase() === "g" || unit.toLowerCase() === "ml" ? normalizedQuantity / 100 : 1;
  return factor ? value / factor : value;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [authForm, setAuthForm] = useState({ email: "", password: "" });
  const [screen, setScreen] = useState<Screen>("today");
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [store, setStore] = useState<StoredState>(emptyState);
  const [foodForm, setFoodForm] = useState(emptyFoodForm);
  const [editingFoodId, setEditingFoodId] = useState<string | null>(null);
  const [savedMeals, setSavedMeals] = useState<SavedMeal[]>([]);
  const [savedMealName, setSavedMealName] = useState("Minha refeição");
  const [savedMealBase, setSavedMealBase] = useState<Meal>("lunch");
  const [query, setQuery] = useState("");
  const [foodOptions, setFoodOptions] = useState<ApiFood[]>([]);
  const [searching, setSearching] = useState(false);
  const [foodSearchDone, setFoodSearchDone] = useState(false);
  const [foodSearchError, setFoodSearchError] = useState("");
  const [scannedFood, setScannedFood] = useState<BarcodeFood | null>(null);
  const [scannerPermission, setScannerPermission] = useState<boolean | null>(null);
  const [scanLocked, setScanLocked] = useState(false);
  const [waterMl, setWaterMl] = useState("250");
  const [exerciseForm, setExerciseForm] = useState({ name: "Caminhada", minutes: "30", calories: "120" });
  const [weightKg, setWeightKg] = useState("");
  const [fastPlan, setFastPlan] = useState({ protocol: "16:8" as Protocol, weightKg: "70", calorieTarget: "2100", context: "normal" as FastContext });
  const [guidance, setGuidance] = useState<FastingGuidance | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

  useEffect(() => {
    if (!supabase) { setLoadingSession(false); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoadingSession(false); });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(storageKey(session?.user.email)).then((value) => {
      if (value) setStore(JSON.parse(value));
    }).catch(() => undefined);
  }, [session?.user.email]);

  useEffect(() => {
    AsyncStorage.setItem(storageKey(session?.user.email), JSON.stringify(store)).catch(() => undefined);
  }, [store, session?.user.email]);

  async function ensureProfile() {
    if (!supabase || !session) return;
    await supabase.from("profiles").upsert({
      id: session.user.id,
      full_name: session.user.email?.split("@")[0] || "Usuário",
      locale: "pt-BR",
      timezone: "America/Fortaleza"
    });
  }

  async function loadCloudData() {
    if (!supabase || !session) return;
    setSyncing(true);
    setSyncMessage("Sincronizando com Supabase...");
    try {
      await ensureProfile();
      const [diary, water, exercise, weight, fasting, savedMealRows] = await Promise.all([
        supabase.from("diary_entries").select("id,meal,food_name_snapshot,quantity,unit,calories_kcal,protein_g,carbs_g,fat_g").eq("diary_date", selectedDate).order("created_at"),
        supabase.from("water_entries").select("id,amount_ml").eq("diary_date", selectedDate).order("created_at"),
        supabase.from("exercise_entries").select("id,name,duration_minutes,calories_kcal").eq("diary_date", selectedDate).order("created_at"),
        supabase.from("weight_entries").select("id,weight_kg,measured_on").order("measured_on", { ascending: true }).limit(30),
        supabase.from("fasting_sessions").select("id,started_at,ended_at,target_end_at,status").order("started_at", { ascending: false }).limit(8),
        supabase.from("saved_meals").select("id,name,meal,items").order("created_at", { ascending: false }).limit(30)
      ]);
      const firstError = diary.error || water.error || exercise.error || weight.error || fasting.error || savedMealRows.error;
      if (firstError) throw firstError;
      setStore({
        foods: diary.data?.map((entry) => ({ id: entry.id, date: selectedDate, meal: entry.meal as Meal, name: entry.food_name_snapshot, quantity: Number(entry.quantity ?? 0), unit: entry.unit ?? "g", calories: Number(entry.calories_kcal ?? 0), protein: Number(entry.protein_g ?? 0), carbs: Number(entry.carbs_g ?? 0), fat: Number(entry.fat_g ?? 0) })) ?? [],
        water: water.data?.map((entry) => ({ id: entry.id, date: selectedDate, amountMl: Number(entry.amount_ml ?? 0) })) ?? [],
        exercises: exercise.data?.map((entry) => ({ id: entry.id, date: selectedDate, name: entry.name, minutes: Number(entry.duration_minutes ?? 0), calories: Number(entry.calories_kcal ?? 0) })) ?? [],
        weights: weight.data?.map((entry) => ({ id: entry.id, date: entry.measured_on, weightKg: Number(entry.weight_kg ?? 0) })) ?? [],
        fasting: fasting.data?.map((entry) => ({ id: entry.id, protocol: fastPlan.protocol, startedAt: entry.started_at, endedAt: entry.ended_at ?? undefined, targetEndAt: entry.target_end_at, status: entry.status as "active" | "completed" | "cancelled" })) ?? []
      });
      setSavedMeals(savedMealRows.data?.map((item) => ({ id: item.id, name: item.name, meal: item.meal as Meal, items: Array.isArray(item.items) ? item.items as Array<Omit<FoodEntry, "id" | "date">> : [] })) ?? []);
      setSyncMessage("Sincronizado com Supabase.");
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "Falha ao sincronizar.");
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    loadCloudData();
  }, [session?.user.id, selectedDate]);

  const dayFoods = store.foods.filter((item) => item.date === selectedDate);
  const dayWater = store.water.filter((item) => item.date === selectedDate);
  const dayExercises = store.exercises.filter((item) => item.date === selectedDate);
  const latestWeight = [...store.weights].sort((a, b) => b.date.localeCompare(a.date))[0];
  const activeFast = store.fasting.find((item) => !item.endedAt);

  const totals = useMemo(() => dayFoods.reduce((acc, entry) => ({
    calories: acc.calories + entry.calories,
    protein: acc.protein + entry.protein,
    carbs: acc.carbs + entry.carbs,
    fat: acc.fat + entry.fat
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 }), [dayFoods]);
  const waterTotal = dayWater.reduce((sum, item) => sum + item.amountMl, 0);
  const exerciseTotal = dayExercises.reduce((sum, item) => sum + item.calories, 0);
  const remaining = 2100 - totals.calories + exerciseTotal;

  async function submitAuth(mode: "login" | "signup") {
    if (!supabase) return Alert.alert("Configuração pendente", "Configure o .env do app mobile com Supabase.");
    const action = mode === "login" ? supabase.auth.signInWithPassword(authForm) : supabase.auth.signUp(authForm);
    const { error } = await action;
    if (error) Alert.alert("Acesso", error.message);
  }

  function applyApiFood(food: ApiFood) {
    setScannedFood(food);
    setFoodSearchDone(false);
    setFoodForm({
      ...emptyFoodForm,
      name: food.brand ? `${food.name} - ${food.brand}` : food.name,
      calories: String(Math.round(food.calories_kcal_100g || 0)),
      protein: String(Math.round((food.protein_g_100g || 0) * 10) / 10),
      carbs: String(Math.round((food.carbs_g_100g || 0) * 10) / 10),
      fat: String(Math.round((food.fat_g_100g || 0) * 10) / 10)
    });
  }

  async function doSearch() {
    if (!query.trim()) return;
    setSearching(true);
    setFoodSearchDone(false);
    setFoodSearchError("");
    try {
      const results = await searchFoods(query.trim());
      setFoodOptions(results);
      setFoodSearchDone(true);
    } catch (error) {
      setFoodOptions([]);
      setFoodSearchDone(true);
      setFoodSearchError(error instanceof Error ? error.message : "Não foi possível buscar agora.");
    } finally {
      setSearching(false);
    }
  }

  async function handleBarcode(code: string) {
    if (scanLocked) return;
    setScanLocked(true);
    try {
      const food = await findFoodByBarcode(code);
      if (!food) { Alert.alert("Produto não encontrado", `Código: ${code}`); setScanLocked(false); return; }
      applyApiFood(food);
      setScreen("log");
    } catch { Alert.alert("Erro", "Não foi possível consultar o produto agora."); setScanLocked(false); }
  }

  async function openScanner() {
    const permission = await BarCodeScanner.requestPermissionsAsync();
    setScannerPermission(permission.status === "granted");
    setScanLocked(false);
    setScreen("scanner");
  }

  async function addFood() {
    if (!foodForm.name.trim() || !foodForm.calories) return Alert.alert("Alimento", "Preencha nome e calorias.");
    const calculated = nutritionFromForm(foodForm);
    const entry: FoodEntry = {
      id: editingFoodId ?? `${Date.now()}`, date: selectedDate, meal: foodForm.meal, name: foodForm.name.trim(), ...calculated
    };
    if (supabase && session) {
      await ensureProfile();
      if (editingFoodId) {
        const { error } = await supabase.from("diary_entries").update({ meal: entry.meal, quantity: entry.quantity, unit: entry.unit, food_name_snapshot: entry.name, calories_kcal: entry.calories, protein_g: entry.protein, carbs_g: entry.carbs, fat_g: entry.fat }).eq("id", editingFoodId);
        if (error) return Alert.alert("Sincronização", error.message);
      } else {
        const { data, error } = await supabase.from("diary_entries").insert({ user_id: session.user.id, diary_date: selectedDate, meal: entry.meal, quantity: entry.quantity, unit: entry.unit, food_name_snapshot: entry.name, calories_kcal: entry.calories, protein_g: entry.protein, carbs_g: entry.carbs, fat_g: entry.fat }).select("id").single();
        if (error) return Alert.alert("Sincronização", error.message);
        if (data?.id) entry.id = data.id;
      }
    }
    setStore((current) => editingFoodId
      ? ({ ...current, foods: current.foods.map((item) => item.id === editingFoodId ? entry : item) })
      : ({ ...current, foods: [...current.foods, entry] })
    );
    setEditingFoodId(null); setScannedFood(null); setFoodForm(emptyFoodForm); setScreen("today");
  }

  function startEditFood(entry: FoodEntry) {
    setEditingFoodId(entry.id);
    setScannedFood(null);
    setFoodForm({
      meal: entry.meal,
      name: entry.name,
      quantity: String(entry.quantity),
      unit: entry.unit,
      calories: String(Math.round(per100(entry.calories, entry.quantity, entry.unit))),
      protein: String(Math.round(per100(entry.protein, entry.quantity, entry.unit) * 10) / 10),
      carbs: String(Math.round(per100(entry.carbs, entry.quantity, entry.unit) * 10) / 10),
      fat: String(Math.round(per100(entry.fat, entry.quantity, entry.unit) * 10) / 10)
    });
    setScreen("log");
  }

  function cancelFoodEdit() {
    setEditingFoodId(null);
    setScannedFood(null);
    setFoodForm(emptyFoodForm);
  }

  async function removeFood(id: string) {
    if (supabase && session) {
      const { error } = await supabase.from("diary_entries").delete().eq("id", id);
      if (error) return Alert.alert("Sincronização", error.message);
    }
    setStore((current) => ({ ...current, foods: current.foods.filter((item) => item.id !== id) }));
  }
  async function createSavedMealFromDay() {
    const items = dayFoods.filter((entry) => entry.meal === savedMealBase).map(({ id, date, ...item }) => item);
    if (!items.length) return Alert.alert("Refeição salva", `Não há itens em ${mealLabels[savedMealBase]} para salvar.`);
    const name = savedMealName.trim() || `${mealLabels[savedMealBase]} ${brDate(selectedDate)}`;
    const localMeal: SavedMeal = { id: `${Date.now()}`, name, meal: savedMealBase, items };
    if (supabase && session) {
      await ensureProfile();
      const { data, error } = await supabase.from("saved_meals").insert({ user_id: session.user.id, name, meal: savedMealBase, items }).select("id,name,meal,items").single();
      if (error) return Alert.alert("Sincronização", error.message);
      if (data) localMeal.id = data.id;
    }
    setSavedMeals((current) => [localMeal, ...current]);
    setSavedMealName("Minha refeição");
  }

  async function applySavedMeal(savedMeal: SavedMeal) {
    if (!savedMeal.items.length) return;
    let entries: FoodEntry[] = savedMeal.items.map((item, index) => ({ ...item, id: `${Date.now()}-${index}`, date: selectedDate }));
    if (supabase && session) {
      await ensureProfile();
      const payload = entries.map((entry) => ({ user_id: session.user.id, diary_date: selectedDate, meal: savedMeal.meal, quantity: entry.quantity, unit: entry.unit, food_name_snapshot: entry.name, calories_kcal: entry.calories, protein_g: entry.protein, carbs_g: entry.carbs, fat_g: entry.fat }));
      const { data, error } = await supabase.from("diary_entries").insert(payload).select("id,meal,food_name_snapshot,quantity,unit,calories_kcal,protein_g,carbs_g,fat_g");
      if (error) return Alert.alert("Sincronização", error.message);
      entries = data?.map((entry) => ({ id: entry.id, date: selectedDate, meal: entry.meal as Meal, name: entry.food_name_snapshot, quantity: Number(entry.quantity ?? 0), unit: entry.unit ?? "g", calories: Number(entry.calories_kcal ?? 0), protein: Number(entry.protein_g ?? 0), carbs: Number(entry.carbs_g ?? 0), fat: Number(entry.fat_g ?? 0) })) ?? entries;
    }
    setStore((current) => ({ ...current, foods: [...current.foods, ...entries] }));
    setScreen("today");
  }

  async function deleteSavedMeal(id: string) {
    if (supabase && session) {
      const { error } = await supabase.from("saved_meals").delete().eq("id", id);
      if (error) return Alert.alert("Sincronização", error.message);
    }
    setSavedMeals((current) => current.filter((item) => item.id !== id));
  }
  async function addWater(amount = Number(waterMl) || 250) {
    const entry: WaterEntry = { id: `${Date.now()}`, date: selectedDate, amountMl: amount };
    if (supabase && session) {
      await ensureProfile();
      const { data, error } = await supabase.from("water_entries").insert({ user_id: session.user.id, diary_date: selectedDate, amount_ml: amount }).select("id").single();
      if (error) return Alert.alert("Sincronização", error.message);
      if (data?.id) entry.id = data.id;
    }
    setStore((current) => ({ ...current, water: [...current.water, entry] }));
  }
  async function addExercise() {
    const entry: ExerciseEntry = { id: `${Date.now()}`, date: selectedDate, name: exerciseForm.name || "Exercício", minutes: Number(exerciseForm.minutes) || 0, calories: Number(exerciseForm.calories) || 0 };
    if (supabase && session) {
      await ensureProfile();
      const { data, error } = await supabase.from("exercise_entries").insert({ user_id: session.user.id, diary_date: selectedDate, name: entry.name, duration_minutes: entry.minutes, calories_kcal: entry.calories }).select("id").single();
      if (error) return Alert.alert("Sincronização", error.message);
      if (data?.id) entry.id = data.id;
    }
    setStore((current) => ({ ...current, exercises: [...current.exercises, entry] }));
  }
  async function addWeight() {
    const value = Number(weightKg.replace(",", "."));
    if (!value) return;
    const entry: WeightEntry = { id: `${Date.now()}`, date: selectedDate, weightKg: value };
    if (supabase && session) {
      await ensureProfile();
      const { data, error } = await supabase.from("weight_entries").insert({ user_id: session.user.id, measured_on: selectedDate, weight_kg: value }).select("id").single();
      if (error) return Alert.alert("Sincronização", error.message);
      if (data?.id) entry.id = data.id;
    }
    setStore((current) => ({ ...current, weights: [...current.weights, entry] }));
    setWeightKg("");
  }

  async function removeWater(id: string) {
    if (supabase && session) {
      const { error } = await supabase.from("water_entries").delete().eq("id", id);
      if (error) return Alert.alert("Sincronização", error.message);
    }
    setStore((current) => ({ ...current, water: current.water.filter((item) => item.id !== id) }));
  }

  async function removeExercise(id: string) {
    if (supabase && session) {
      const { error } = await supabase.from("exercise_entries").delete().eq("id", id);
      if (error) return Alert.alert("Sincronização", error.message);
    }
    setStore((current) => ({ ...current, exercises: current.exercises.filter((item) => item.id !== id) }));
  }

  async function removeWeight(id: string) {
    if (supabase && session) {
      const { error } = await supabase.from("weight_entries").delete().eq("id", id);
      if (error) return Alert.alert("Sincronização", error.message);
    }
    setStore((current) => ({ ...current, weights: current.weights.filter((item) => item.id !== id) }));
  }
  async function toggleFast() {
    if (activeFast) {
      const endedAt = new Date().toISOString();
      if (supabase && session) {
        const { error } = await supabase.from("fasting_sessions").update({ ended_at: endedAt, status: "completed" }).eq("id", activeFast.id);
        if (error) return Alert.alert("Sincronização", error.message);
      }
      setStore((current) => ({ ...current, fasting: current.fasting.map((item) => item.id === activeFast.id ? { ...item, endedAt, status: "completed" } : item) }));
      return;
    }
    const startedAt = new Date();
    const targetEndAt = new Date(startedAt.getTime() + protocolHours[fastPlan.protocol] * 60 * 60 * 1000);
    const entry: FastingSession = { id: `${Date.now()}`, protocol: fastPlan.protocol, startedAt: startedAt.toISOString(), targetEndAt: targetEndAt.toISOString(), status: "active" };
    if (supabase && session) {
      await ensureProfile();
      const { data, error } = await supabase.from("fasting_sessions").insert({ user_id: session.user.id, started_at: entry.startedAt, target_end_at: entry.targetEndAt, status: "active" }).select("id").single();
      if (error) return Alert.alert("Sincronização", error.message);
      if (data?.id) entry.id = data.id;
    }
    setStore((current) => ({ ...current, fasting: [entry, ...current.fasting] }));
  }
  async function loadGuidance() { const data = await getFastingGuidance({ protocol: fastPlan.protocol, weight_kg: Number(fastPlan.weightKg) || 70, calorie_target: Number(fastPlan.calorieTarget) || 2100, context: fastPlan.context }); setGuidance(data); }

  if (loadingSession) return <SafeAreaView style={styles.center}><ActivityIndicator color="#0066ee" /></SafeAreaView>;
  if (!session) return <AuthScreen authForm={authForm} setAuthForm={setAuthForm} submitAuth={submitAuth} />;

  return <SafeAreaView style={styles.safe}><StatusBar style="dark" /><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.header}><View><Text style={styles.eyebrow}>Nutrição & Fitness</Text><Text style={styles.title}>Hoje</Text><Text style={styles.subtitle}>{brDate(selectedDate)} · {session.user.email}</Text></View><Pressable style={styles.iconButton} onPress={() => supabase?.auth.signOut()}><Ionicons name="log-out-outline" size={22} color="#12355f" /></Pressable></View>
    <DateSwitcher selectedDate={selectedDate} setSelectedDate={setSelectedDate} />
    <Text style={styles.syncText}>{syncing ? "Sincronizando..." : syncMessage || "Conectado ao Supabase"}</Text>
    {screen === "today" ? <TodayScreen totals={totals} remaining={remaining} waterTotal={waterTotal} exerciseTotal={exerciseTotal} latestWeight={latestWeight} entries={dayFoods} removeFood={removeFood} startEditFood={startEditFood} /> : null}
    {screen === "log" ? <LogScreen foodForm={foodForm} setFoodForm={setFoodForm} scannedFood={scannedFood} addFood={addFood} editingFoodId={editingFoodId} cancelFoodEdit={cancelFoodEdit} query={query} setQuery={setQuery} foodOptions={foodOptions} searching={searching} foodSearchDone={foodSearchDone} foodSearchError={foodSearchError} doSearch={doSearch} applyApiFood={applyApiFood} savedMeals={savedMeals} savedMealName={savedMealName} setSavedMealName={setSavedMealName} savedMealBase={savedMealBase} setSavedMealBase={setSavedMealBase} createSavedMealFromDay={createSavedMealFromDay} applySavedMeal={applySavedMeal} deleteSavedMeal={deleteSavedMeal} /> : null}
    {screen === "scanner" ? <ScannerScreen scannerPermission={scannerPermission} scanLocked={scanLocked} openScanner={openScanner} handleBarcode={handleBarcode} /> : null}
    {screen === "fasting" ? <FastingScreen activeFast={activeFast} fastPlan={fastPlan} setFastPlan={setFastPlan} guidance={guidance} toggleFast={toggleFast} loadGuidance={loadGuidance} /> : null}
    {screen === "progress" ? <ProgressScreen waterMl={waterMl} setWaterMl={setWaterMl} addWater={addWater} exerciseForm={exerciseForm} setExerciseForm={setExerciseForm} addExercise={addExercise} weightKg={weightKg} setWeightKg={setWeightKg} addWeight={addWeight} removeWater={removeWater} removeExercise={removeExercise} removeWeight={removeWeight} weights={store.weights} exercises={dayExercises} waterEntries={dayWater} waterTotal={waterTotal} /> : null}
  </ScrollView><View style={styles.tabBar}><Tab icon="today-outline" label="Hoje" active={screen === "today"} onPress={() => setScreen("today")} /><Tab icon="add-circle-outline" label="Registrar" active={screen === "log"} onPress={() => setScreen("log")} /><Tab icon="barcode-outline" label="Scanner" active={screen === "scanner"} onPress={openScanner} /><Tab icon="time-outline" label="Jejum" active={screen === "fasting"} onPress={() => setScreen("fasting")} /><Tab icon="scale-outline" label="Progresso" active={screen === "progress"} onPress={() => setScreen("progress")} /></View></SafeAreaView>;
}

function AuthScreen({ authForm, setAuthForm, submitAuth }: { authForm: { email: string; password: string }; setAuthForm: Dispatch<SetStateAction<{ email: string; password: string }>>; submitAuth: (mode: "login" | "signup") => void }) {
  return <SafeAreaView style={styles.safe}><StatusBar style="dark" /><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.authWrap}><View style={styles.logo}><Ionicons name="flame" size={28} color="#fff" /></View><Text style={styles.title}>Nutrição & Fitness</Text><Text style={styles.subtitle}>Entre para registrar alimentos, água, exercícios, jejum e progresso no app mobile.</Text>{!hasSupabaseConfig ? <Text style={styles.warning}>Configure o .env do mobile para ativar o login.</Text> : null}<TextInput style={styles.input} placeholder="E-mail" autoCapitalize="none" value={authForm.email} onChangeText={(email) => setAuthForm((current) => ({ ...current, email }))} /><TextInput style={styles.input} placeholder="Senha" secureTextEntry value={authForm.password} onChangeText={(password) => setAuthForm((current) => ({ ...current, password }))} /><Pressable style={styles.primaryButton} onPress={() => submitAuth("login")}><Text style={styles.primaryButtonText}>Entrar</Text></Pressable><Pressable style={styles.secondaryButton} onPress={() => submitAuth("signup")}><Text style={styles.secondaryButtonText}>Criar conta</Text></Pressable></KeyboardAvoidingView></SafeAreaView>;
}

function DateSwitcher({ selectedDate, setSelectedDate }: { selectedDate: string; setSelectedDate: (date: string) => void }) {
  return <View style={styles.dateRow}><Pressable style={styles.smallButton} onPress={() => setSelectedDate(addDays(selectedDate, -1))}><Text style={styles.smallButtonText}>Dia anterior</Text></Pressable><TextInput style={[styles.input, styles.dateInput]} value={brDate(selectedDate)} onChangeText={(value) => setSelectedDate(parseBrDate(value))} placeholder="dd/mm/aaaa" /><Pressable style={styles.smallButton} onPress={() => setSelectedDate(addDays(selectedDate, 1))}><Text style={styles.smallButtonText}>Próximo</Text></Pressable></View>;
}

function TodayScreen({ totals, remaining, waterTotal, exerciseTotal, latestWeight, entries, removeFood, startEditFood }: { totals: { calories: number; protein: number; carbs: number; fat: number }; remaining: number; waterTotal: number; exerciseTotal: number; latestWeight?: WeightEntry; entries: FoodEntry[]; removeFood: (id: string) => void; startEditFood: (entry: FoodEntry) => void }) {
  return <View><View style={styles.grid}><Metric label="Restantes" value={remaining} suffix="kcal" /><Metric label="Consumidas" value={totals.calories} suffix="kcal" /><Metric label="Água" value={waterTotal / 1000} suffix="L" decimals={1} /><Metric label="Exercícios" value={exerciseTotal} suffix="kcal" /></View><View style={styles.grid}><Metric label="Proteína" value={totals.protein} suffix="g" decimals={1} /><Metric label="Carboidratos" value={totals.carbs} suffix="g" decimals={1} /><Metric label="Gorduras" value={totals.fat} suffix="g" decimals={1} /><Metric label="Peso" value={latestWeight?.weightKg || 0} suffix="kg" decimals={1} /></View><View style={styles.card}><Text style={styles.cardTitle}>Diário alimentar</Text>{entries.length === 0 ? <Text style={styles.muted}>Nenhum alimento registrado nessa data.</Text> : null}{entries.map((entry) => <View key={entry.id} style={styles.entryRow}><View style={styles.entryContent}><Text style={styles.entryName}>{entry.name}</Text><Text style={styles.muted}>{mealLabels[entry.meal]} · {numberText(entry.quantity)}{entry.unit} · P {entry.protein}g · C {entry.carbs}g · G {entry.fat}g</Text></View><View style={styles.entryRight}><Text style={styles.kcal}>{entry.calories} kcal</Text><Pressable onPress={() => startEditFood(entry)}><Text style={styles.editText}>Editar</Text></Pressable><Pressable onPress={() => removeFood(entry.id)}><Text style={styles.deleteText}>Excluir</Text></Pressable></View></View>)}</View></View>;
}

function LogScreen({ foodForm, setFoodForm, scannedFood, addFood, editingFoodId, cancelFoodEdit, query, setQuery, foodOptions, searching, foodSearchDone, foodSearchError, doSearch, applyApiFood, savedMeals, savedMealName, setSavedMealName, savedMealBase, setSavedMealBase, createSavedMealFromDay, applySavedMeal, deleteSavedMeal }: { foodForm: typeof emptyFoodForm; setFoodForm: Dispatch<SetStateAction<typeof emptyFoodForm>>; scannedFood: BarcodeFood | null; addFood: () => void; editingFoodId: string | null; cancelFoodEdit: () => void; query: string; setQuery: (value: string) => void; foodOptions: ApiFood[]; searching: boolean; foodSearchDone: boolean; foodSearchError: string; doSearch: () => void; applyApiFood: (food: ApiFood) => void; savedMeals: SavedMeal[]; savedMealName: string; setSavedMealName: (value: string) => void; savedMealBase: Meal; setSavedMealBase: (meal: Meal) => void; createSavedMealFromDay: () => void; applySavedMeal: (meal: SavedMeal) => void; deleteSavedMeal: (id: string) => void }) {
  const preview = nutritionFromForm(foodForm);
  return <View><SavedMealsPanel savedMeals={savedMeals} savedMealName={savedMealName} setSavedMealName={setSavedMealName} savedMealBase={savedMealBase} setSavedMealBase={setSavedMealBase} createSavedMealFromDay={createSavedMealFromDay} applySavedMeal={applySavedMeal} deleteSavedMeal={deleteSavedMeal} /><View style={styles.card}><Text style={styles.cardTitle}>Buscar alimento na base</Text><Text style={styles.muted}>Digite o alimento e toque em buscar. Depois use o botão verde para preencher o formulário.</Text><View style={styles.row}><TextInput style={[styles.input, styles.flex]} placeholder="Ex.: hambúrguer, pizza, arroz" value={query} onSubmitEditing={doSearch} onChangeText={setQuery} /><Pressable style={styles.squareButton} onPress={doSearch}><Ionicons name="search" size={22} color="#fff" /></Pressable></View>{searching ? <Text style={styles.muted}>Buscando...</Text> : null}{foodSearchError ? <Text style={styles.warning}>{foodSearchError}</Text> : null}{foodSearchDone && !searching && !foodSearchError && foodOptions.length === 0 ? <Text style={styles.warning}>Nenhum alimento encontrado. Tente outro nome, como “carne bovina”, “batata frita” ou “iogurte”.</Text> : null}{foodOptions.length ? <Text style={styles.resultCount}>{foodOptions.length} resultado(s) encontrado(s)</Text> : null}{foodOptions.map((food) => <View key={`${food.code || food.name}-${food.brand || ""}`} style={styles.foodResultCard}><View style={styles.entryContent}><Text style={styles.entryName}>{food.name}</Text><Text style={styles.muted}>{food.brand || "Base nutricional"} - {Math.round(food.calories_kcal_100g)} kcal/100g</Text><Text style={styles.macroLine}>P {numberText(food.protein_g_100g, 1)}g - C {numberText(food.carbs_g_100g, 1)}g - G {numberText(food.fat_g_100g, 1)}g</Text></View><Pressable style={styles.useFoodButton} onPress={() => applyApiFood(food)}><Text style={styles.useFoodButtonText}>Usar</Text></Pressable></View>)}</View><View style={styles.card}><Text style={styles.cardTitle}>{editingFoodId ? "Editar alimento" : "Registrar alimento"}</Text>{editingFoodId ? <Text style={styles.success}>Editando item do diário.</Text> : null}{scannedFood ? <Text style={styles.success}>Produto lido pelo código de barras.</Text> : null}<MealPicker value={foodForm.meal} onChange={(meal) => setFoodForm((current) => ({ ...current, meal }))} /><TextInput style={styles.input} placeholder="Alimento" value={foodForm.name} onChangeText={(name) => setFoodForm((current) => ({ ...current, name }))} /><View style={styles.row}><TextInput style={[styles.input, styles.flex]} placeholder="Quantidade" keyboardType="numeric" value={foodForm.quantity} onChangeText={(quantity) => setFoodForm((current) => ({ ...current, quantity }))} /><TextInput style={[styles.input, styles.flex]} placeholder="Unidade" value={foodForm.unit} onChangeText={(unit) => setFoodForm((current) => ({ ...current, unit }))} /></View><View style={styles.row}><TextInput style={[styles.input, styles.flex]} placeholder="Kcal/100g" keyboardType="numeric" value={foodForm.calories} onChangeText={(calories) => setFoodForm((current) => ({ ...current, calories }))} /><TextInput style={[styles.input, styles.flex]} placeholder="Proteína" keyboardType="numeric" value={foodForm.protein} onChangeText={(protein) => setFoodForm((current) => ({ ...current, protein }))} /></View><View style={styles.row}><TextInput style={[styles.input, styles.flex]} placeholder="Carbo." keyboardType="numeric" value={foodForm.carbs} onChangeText={(carbs) => setFoodForm((current) => ({ ...current, carbs }))} /><TextInput style={[styles.input, styles.flex]} placeholder="Gord." keyboardType="numeric" value={foodForm.fat} onChangeText={(fat) => setFoodForm((current) => ({ ...current, fat }))} /></View><View style={styles.previewBox}><Text style={styles.previewTitle}>Prévia para {numberText(preview.quantity)}{preview.unit}</Text><Text style={styles.previewText}>{preview.calories} kcal - P {numberText(preview.protein, 1)}g - C {numberText(preview.carbs, 1)}g - G {numberText(preview.fat, 1)}g</Text></View><Pressable style={styles.primaryButton} onPress={addFood}><Text style={styles.primaryButtonText}>{editingFoodId ? "Salvar alterações" : "Adicionar ao diário"}</Text></Pressable>{editingFoodId ? <Pressable style={styles.secondaryButton} onPress={cancelFoodEdit}><Text style={styles.secondaryButtonText}>Cancelar edição</Text></Pressable> : null}</View></View>;
}


function SavedMealsPanel({ savedMeals, savedMealName, setSavedMealName, savedMealBase, setSavedMealBase, createSavedMealFromDay, applySavedMeal, deleteSavedMeal }: { savedMeals: SavedMeal[]; savedMealName: string; setSavedMealName: (value: string) => void; savedMealBase: Meal; setSavedMealBase: (meal: Meal) => void; createSavedMealFromDay: () => void; applySavedMeal: (meal: SavedMeal) => void; deleteSavedMeal: (id: string) => void }) {
  return <View style={styles.card}><Text style={styles.cardTitle}>Refeições salvas</Text><Text style={styles.muted}>Salve os itens de uma refeição da data atual e aplique depois em qualquer dia.</Text><TextInput style={styles.input} placeholder="Nome da refeição" value={savedMealName} onChangeText={setSavedMealName} /><MealPicker value={savedMealBase} onChange={setSavedMealBase} /><Pressable style={styles.secondaryButton} onPress={createSavedMealFromDay}><Text style={styles.secondaryButtonText}>Salvar refeição da data</Text></Pressable>{savedMeals.length === 0 ? <Text style={styles.muted}>Nenhuma refeição salva ainda.</Text> : null}{savedMeals.map((meal) => <View key={meal.id} style={styles.listRow}><View style={styles.entryContent}><Text style={styles.entryName}>{meal.name}</Text><Text style={styles.muted}>{mealLabels[meal.meal]} - {meal.items.length} item(ns) - {meal.items.reduce((sum, item) => sum + item.calories, 0)} kcal</Text></View><View style={styles.entryRight}><Pressable onPress={() => applySavedMeal(meal)}><Text style={styles.editText}>Aplicar</Text></Pressable><Pressable onPress={() => deleteSavedMeal(meal.id)}><Text style={styles.deleteText}>Excluir</Text></Pressable></View></View>)}</View>;
}

function MealPicker({ value, onChange }: { value: Meal; onChange: (meal: Meal) => void }) { return <View style={styles.chips}>{(Object.keys(mealLabels) as Meal[]).map((meal) => <Pressable key={meal} style={[styles.chip, value === meal && styles.chipActive]} onPress={() => onChange(meal)}><Text style={[styles.chipText, value === meal && styles.chipTextActive]}>{mealLabels[meal]}</Text></Pressable>)}</View>; }

function ScannerScreen({ scannerPermission, scanLocked, openScanner, handleBarcode }: { scannerPermission: boolean | null; scanLocked: boolean; openScanner: () => void; handleBarcode: (code: string) => void }) { return <View style={styles.card}><Text style={styles.cardTitle}>Código de barras</Text>{scannerPermission === false ? <Text style={styles.warning}>Permissão de câmera negada.</Text> : null}{scannerPermission ? <View style={styles.scannerBox}><BarCodeScanner style={StyleSheet.absoluteFillObject} onBarCodeScanned={({ data }) => handleBarcode(data)} /></View> : <Pressable style={styles.primaryButton} onPress={openScanner}><Text style={styles.primaryButtonText}>Permitir câmera</Text></Pressable>}{scanLocked ? <Text style={styles.muted}>Consultando produto...</Text> : null}</View>; }

function FastingScreen({ activeFast, fastPlan, setFastPlan, guidance, toggleFast, loadGuidance }: { activeFast?: FastingSession; fastPlan: { protocol: Protocol; weightKg: string; calorieTarget: string; context: FastContext }; setFastPlan: Dispatch<SetStateAction<{ protocol: Protocol; weightKg: string; calorieTarget: string; context: FastContext }>>; guidance: FastingGuidance | null; toggleFast: () => void; loadGuidance: () => void }) {
  return <View><View style={styles.card}><Text style={styles.cardTitle}>Jejum intermitente</Text><Text style={styles.muted}>{activeFast ? `Jejum iniciado em ${new Date(activeFast.startedAt).toLocaleString("pt-BR")}` : "Nenhum jejum ativo."}</Text><View style={styles.chips}>{(["12:12", "14:10", "16:8", "18:6"] as Protocol[]).map((p) => <Pressable key={p} style={[styles.chip, fastPlan.protocol === p && styles.chipActive]} onPress={() => setFastPlan((c) => ({ ...c, protocol: p }))}><Text style={[styles.chipText, fastPlan.protocol === p && styles.chipTextActive]}>{p}</Text></Pressable>)}</View><View style={styles.row}><TextInput style={[styles.input, styles.flex]} placeholder="Peso kg" keyboardType="numeric" value={fastPlan.weightKg} onChangeText={(weightKg) => setFastPlan((c) => ({ ...c, weightKg }))} /><TextInput style={[styles.input, styles.flex]} placeholder="Meta kcal" keyboardType="numeric" value={fastPlan.calorieTarget} onChangeText={(calorieTarget) => setFastPlan((c) => ({ ...c, calorieTarget }))} /></View><Pressable style={styles.secondaryButton} onPress={loadGuidance}><Text style={styles.secondaryButtonText}>Gerar orientação</Text></Pressable><Pressable style={styles.primaryButton} onPress={toggleFast}><Text style={styles.primaryButtonText}>{activeFast ? "Encerrar jejum" : `Iniciar jejum de ${protocolHours[fastPlan.protocol]}h`}</Text></Pressable></View>{guidance ? <View style={styles.card}><Text style={styles.cardTitle}>Entre a última e a próxima refeição</Text><Text style={styles.muted}>Ingerir cerca de {guidance.hydration_between_meals_ml} ml de água. Ao quebrar o jejum, mire {guidance.break_fast_calories_min}–{guidance.break_fast_calories_max} kcal, com pelo menos {guidance.protein_min_g} g de proteína e {guidance.fiber_min_g} g de fibras.</Text>{guidance.guidance?.map((item) => <Text key={item} style={styles.bullet}>• {item}</Text>)}{guidance.safety_notes?.map((item) => <Text key={item} style={styles.warning}>⚠ {item}</Text>)}</View> : null}</View>;
}
function ProgressScreen({ waterMl, setWaterMl, addWater, removeWater, exerciseForm, setExerciseForm, addExercise, removeExercise, weightKg, setWeightKg, addWeight, removeWeight, weights, exercises, waterEntries, waterTotal }: { waterMl: string; setWaterMl: (v: string) => void; addWater: (amount?: number) => void; removeWater: (id: string) => void; exerciseForm: { name: string; minutes: string; calories: string }; setExerciseForm: Dispatch<SetStateAction<{ name: string; minutes: string; calories: string }>>; addExercise: () => void; removeExercise: (id: string) => void; weightKg: string; setWeightKg: (v: string) => void; addWeight: () => void; removeWeight: (id: string) => void; weights: WeightEntry[]; exercises: ExerciseEntry[]; waterEntries: WaterEntry[]; waterTotal: number }) {
  return <View><View style={styles.card}><Text style={styles.cardTitle}>Água</Text><Text style={styles.metricValue}>{numberText(waterTotal / 1000, 1)} L</Text><View style={styles.row}><TextInput style={[styles.input, styles.flex]} placeholder="ml" keyboardType="numeric" value={waterMl} onChangeText={setWaterMl} /><Pressable style={styles.squareButton} onPress={() => addWater()}><Ionicons name="add" size={24} color="#fff" /></Pressable></View><View style={styles.chips}>{[250, 500, 750].map((ml) => <Pressable key={ml} style={styles.chip} onPress={() => addWater(ml)}><Text style={styles.chipText}>{ml} ml</Text></Pressable>)}</View>{waterEntries.map((item) => <View key={item.id} style={styles.listRow}><Text style={styles.bullet}>• {item.amountMl} ml</Text><Pressable onPress={() => removeWater(item.id)}><Text style={styles.deleteText}>Excluir</Text></Pressable></View>)}</View><View style={styles.card}><Text style={styles.cardTitle}>Exercícios</Text><TextInput style={styles.input} placeholder="Nome" value={exerciseForm.name} onChangeText={(name) => setExerciseForm((c) => ({ ...c, name }))} /><View style={styles.row}><TextInput style={[styles.input, styles.flex]} placeholder="Minutos" keyboardType="numeric" value={exerciseForm.minutes} onChangeText={(minutes) => setExerciseForm((c) => ({ ...c, minutes }))} /><TextInput style={[styles.input, styles.flex]} placeholder="Kcal" keyboardType="numeric" value={exerciseForm.calories} onChangeText={(calories) => setExerciseForm((c) => ({ ...c, calories }))} /></View><Pressable style={styles.primaryButton} onPress={addExercise}><Text style={styles.primaryButtonText}>Adicionar exercício</Text></Pressable>{exercises.map((item) => <View key={item.id} style={styles.listRow}><Text style={styles.bullet}>• {item.name}: {item.minutes} min · {item.calories} kcal</Text><Pressable onPress={() => removeExercise(item.id)}><Text style={styles.deleteText}>Excluir</Text></Pressable></View>)}</View><View style={styles.card}><Text style={styles.cardTitle}>Peso</Text><View style={styles.row}><TextInput style={[styles.input, styles.flex]} placeholder="Peso kg" keyboardType="numeric" value={weightKg} onChangeText={setWeightKg} /><Pressable style={styles.squareButton} onPress={addWeight}><Ionicons name="save-outline" size={22} color="#fff" /></Pressable></View>{weights.slice(-5).reverse().map((item) => <View key={item.id} style={styles.listRow}><Text style={styles.bullet}>• {brDate(item.date)}: {numberText(item.weightKg, 1)} kg</Text><Pressable onPress={() => removeWeight(item.id)}><Text style={styles.deleteText}>Excluir</Text></Pressable></View>)}</View></View>;
}

function Metric({ label, value, suffix, decimals = 0 }: { label: string; value: number; suffix: string; decimals?: number }) { return <View style={styles.metricCard}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{numberText(value, decimals)}<Text style={styles.metricSuffix}> {suffix}</Text></Text></View>; }
function Tab({ icon, label, active, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; active: boolean; onPress: () => void }) { return <Pressable style={styles.tab} onPress={onPress}><Ionicons name={icon} size={22} color={active ? "#0066ee" : "#64748b"} /><Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text></Pressable>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f8fc" }, center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f4f8fc" }, authWrap: { flex: 1, justifyContent: "center", padding: 22 }, content: { width: "100%", paddingHorizontal: 14, paddingTop: 18, paddingBottom: 110, overflow: "hidden" }, logo: { width: 58, height: 58, borderRadius: 18, backgroundColor: "#0066ee", alignItems: "center", justifyContent: "center", marginBottom: 16 }, header: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14 }, eyebrow: { color: "#0066ee", fontSize: 12, fontWeight: "800", textTransform: "uppercase" }, title: { color: "#111827", fontSize: 34, fontWeight: "900", letterSpacing: -1, marginTop: 4 }, subtitle: { color: "#64748b", fontSize: 15, lineHeight: 22, marginTop: 4 }, warning: { color: "#9a3412", backgroundColor: "#fff7ed", borderRadius: 14, padding: 12, marginBottom: 12, fontWeight: "700" }, success: { color: "#166534", backgroundColor: "#f0fdf4", borderRadius: 14, padding: 12, marginBottom: 12, fontWeight: "700" }, input: { minHeight: 48, minWidth: 0, borderRadius: 16, borderWidth: 1, borderColor: "#d7e3f2", backgroundColor: "#fff", paddingHorizontal: 14, marginBottom: 10, color: "#111827" }, primaryButton: { minHeight: 50, borderRadius: 16, backgroundColor: "#0066ee", alignItems: "center", justifyContent: "center", marginTop: 4 }, primaryButtonText: { color: "#fff", fontWeight: "900", fontSize: 16 }, secondaryButton: { minHeight: 50, borderRadius: 16, borderWidth: 1, borderColor: "#cfe0f4", backgroundColor: "#fff", alignItems: "center", justifyContent: "center", marginTop: 10 }, secondaryButtonText: { color: "#12355f", fontWeight: "900", fontSize: 16 }, smallButton: { minHeight: 42, borderRadius: 14, backgroundColor: "#e8f1ff", paddingHorizontal: 12, alignItems: "center", justifyContent: "center" }, smallButtonText: { color: "#12355f", fontWeight: "900", fontSize: 12 }, squareButton: { width: 50, height: 48, borderRadius: 16, backgroundColor: "#0066ee", alignItems: "center", justifyContent: "center" }, iconButton: { width: 46, height: 46, borderRadius: 16, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#d7e3f2" }, dateRow: { width: "100%", flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 12 }, dateInput: { flexGrow: 1, flexShrink: 1, flexBasis: 130, textAlign: "center", marginBottom: 0, fontWeight: "800" }, grid: { width: "100%", flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 12 }, metricCard: { flexGrow: 1, flexShrink: 1, flexBasis: "47%", minWidth: 135, borderRadius: 20, backgroundColor: "#fff", padding: 14, borderWidth: 1, borderColor: "#dce7f4" }, metricLabel: { color: "#64748b", fontSize: 12, fontWeight: "800" }, metricValue: { color: "#111827", fontSize: 25, fontWeight: "900", marginTop: 8 }, metricSuffix: { color: "#64748b", fontSize: 13 }, card: { width: "100%", maxWidth: "100%", borderRadius: 22, backgroundColor: "#fff", padding: 16, borderWidth: 1, borderColor: "#dce7f4", marginBottom: 14, overflow: "hidden" }, cardTitle: { color: "#111827", fontSize: 18, fontWeight: "900", marginBottom: 10 }, muted: { color: "#64748b", lineHeight: 21, flexShrink: 1 }, bullet: { color: "#475569", lineHeight: 22, marginTop: 8 }, entryRow: { borderTopWidth: 1, borderTopColor: "#edf3fa", paddingVertical: 12, gap: 8, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }, entryContent: { flexGrow: 1, flexShrink: 1, flexBasis: 180, minWidth: 0, paddingRight: 8 }, entryRight: { alignItems: "flex-start", flexShrink: 0 }, entryName: { color: "#111827", fontWeight: "900", fontSize: 15 }, kcal: { color: "#0066ee", fontWeight: "900" }, deleteText: { color: "#dc2626", fontWeight: "800", marginTop: 6 }, editText: { color: "#0066ee", fontWeight: "800", marginTop: 6 }, row: { width: "100%", flexDirection: "row", flexWrap: "wrap", gap: 10 }, listRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, borderTopWidth: 1, borderTopColor: "#edf3fa", paddingVertical: 8 }, flex: { flexGrow: 1, flexShrink: 1, flexBasis: 130, minWidth: 0 }, scannerBox: { height: 360, overflow: "hidden", borderRadius: 22, backgroundColor: "#0f172a", marginTop: 8 }, chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 }, chip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: "#eef5ff", borderWidth: 1, borderColor: "#d7e3f2" }, chipActive: { backgroundColor: "#0066ee", borderColor: "#0066ee" }, chipText: { color: "#12355f", fontWeight: "800" }, chipTextActive: { color: "#fff" }, foodOption: { borderTopWidth: 1, borderTopColor: "#edf3fa", paddingVertical: 12 }, resultCount: { color: "#0066ee", fontWeight: "900", marginBottom: 10 }, foodResultCard: { width: "100%", borderWidth: 1, borderColor: "#dce7f4", backgroundColor: "#f8fbff", borderRadius: 16, padding: 12, marginTop: 10, flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }, macroLine: { color: "#12355f", fontWeight: "800", marginTop: 4 }, useFoodButton: { backgroundColor: "#16a34a", borderRadius: 14, minHeight: 42, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", alignSelf: "flex-start" }, useFoodButtonText: { color: "#fff", fontWeight: "900" }, tabBar: { position: "absolute", left: 0, right: 0, bottom: 0, minHeight: 76, paddingTop: 8, paddingBottom: 12, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#dce7f4", flexDirection: "row", justifyContent: "space-around" }, tab: { alignItems: "center", gap: 3, flex: 1 }, tabText: { color: "#64748b", fontSize: 10, fontWeight: "800", textAlign: "center" }, tabTextActive: { color: "#0066ee" }, previewBox: { borderRadius: 16, backgroundColor: "#eefbf3", borderWidth: 1, borderColor: "#bbf7d0", padding: 12, marginBottom: 12 }, previewTitle: { color: "#166534", fontWeight: "900", marginBottom: 4 }, previewText: { color: "#14532d", fontWeight: "800" }, syncText: { color: "#64748b", fontSize: 12, fontWeight: "800", marginBottom: 12 }
});
