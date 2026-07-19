import { Ionicons } from "@expo/vector-icons";
import { BarCodeScanner } from "expo-barcode-scanner";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { Session } from "@supabase/supabase-js";

import { findFoodByBarcode, type BarcodeFood } from "./src/lib/api";
import { hasSupabaseConfig, supabase } from "./src/lib/supabase";

type Screen = "today" | "log" | "scanner" | "fasting" | "progress";
type Meal = "breakfast" | "lunch" | "dinner" | "snack";

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

const mealLabels: Record<Meal, string> = {
  breakfast: "CafÃ©",
  lunch: "AlmoÃ§o",
  dinner: "Jantar",
  snack: "Lanche"
};

const emptyFoodForm = { meal: "lunch" as Meal, name: "", quantity: "100", unit: "g", calories: "", protein: "", carbs: "", fat: "" };

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [authForm, setAuthForm] = useState({ email: "", password: "" });
  const [screen, setScreen] = useState<Screen>("today");
  const [foodEntries, setFoodEntries] = useState<FoodEntry[]>([]);
  const [foodForm, setFoodForm] = useState(emptyFoodForm);
  const [scannedFood, setScannedFood] = useState<BarcodeFood | null>(null);
  const [scannerPermission, setScannerPermission] = useState<boolean | null>(null);
  const [scanLocked, setScanLocked] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setLoadingSession(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoadingSession(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);

  const totals = useMemo(() => foodEntries.reduce((acc, entry) => ({
    calories: acc.calories + entry.calories,
    protein: acc.protein + entry.protein,
    carbs: acc.carbs + entry.carbs,
    fat: acc.fat + entry.fat
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 }), [foodEntries]);

  async function submitAuth(mode: "login" | "signup") {
    if (!supabase) return Alert.alert("ConfiguraÃ§Ã£o pendente", "Configure o .env do app mobile com Supabase.");
    const action = mode === "login" ? supabase.auth.signInWithPassword(authForm) : supabase.auth.signUp(authForm);
    const { error } = await action;
    if (error) Alert.alert("Acesso", error.message);
  }

  function applyBarcodeFood(food: BarcodeFood) {
    setScannedFood(food);
    setFoodForm({
      ...emptyFoodForm,
      name: food.brand ? `${food.name} - ${food.brand}` : food.name,
      calories: String(Math.round(food.calories_kcal_100g || 0)),
      protein: String(Math.round((food.protein_g_100g || 0) * 10) / 10),
      carbs: String(Math.round((food.carbs_g_100g || 0) * 10) / 10),
      fat: String(Math.round((food.fat_g_100g || 0) * 10) / 10)
    });
    setScreen("log");
  }

  async function handleBarcode(code: string) {
    if (scanLocked) return;
    setScanLocked(true);
    try {
      const food = await findFoodByBarcode(code);
      if (!food) {
        Alert.alert("Produto nÃ£o encontrado", `CÃ³digo: ${code}`);
        setScanLocked(false);
        return;
      }
      applyBarcodeFood(food);
    } catch {
      Alert.alert("Erro", "NÃ£o foi possÃ­vel consultar o produto agora.");
      setScanLocked(false);
    }
  }

  async function openScanner() {
    const permission = await BarCodeScanner.requestPermissionsAsync();
    setScannerPermission(permission.status === "granted");
    setScanLocked(false);
    setScreen("scanner");
  }

  function addFood() {
    if (!foodForm.name.trim() || !foodForm.calories) return Alert.alert("Alimento", "Preencha nome e calorias.");
    const quantity = Number(foodForm.quantity) || 100;
    const factor = foodForm.unit === "g" ? quantity / 100 : 1;
    setFoodEntries((current) => [...current, {
      id: `${Date.now()}`,
      meal: foodForm.meal,
      name: foodForm.name.trim(),
      quantity,
      unit: foodForm.unit.trim() || "g",
      calories: Math.round((Number(foodForm.calories) || 0) * factor),
      protein: Math.round((Number(foodForm.protein) || 0) * factor * 10) / 10,
      carbs: Math.round((Number(foodForm.carbs) || 0) * factor * 10) / 10,
      fat: Math.round((Number(foodForm.fat) || 0) * factor * 10) / 10
    }]);
    setScannedFood(null);
    setFoodForm(emptyFoodForm);
    setScreen("today");
  }

  if (loadingSession) {
    return <SafeAreaView style={styles.center}><ActivityIndicator color="#0066ee" /></SafeAreaView>;
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.authWrap}>
          <View style={styles.logo}><Ionicons name="flame" size={28} color="#fff" /></View>
          <Text style={styles.title}>NutriÃ§Ã£o & Fitness</Text>
          <Text style={styles.subtitle}>Entre para registrar alimentos, jejum e progresso no app mobile.</Text>
          {!hasSupabaseConfig ? <Text style={styles.warning}>Configure o .env do mobile para ativar o login.</Text> : null}
          <TextInput style={styles.input} placeholder="E-mail" autoCapitalize="none" value={authForm.email} onChangeText={(email) => setAuthForm((current) => ({ ...current, email }))} />
          <TextInput style={styles.input} placeholder="Senha" secureTextEntry value={authForm.password} onChangeText={(password) => setAuthForm((current) => ({ ...current, password }))} />
          <Pressable style={styles.primaryButton} onPress={() => submitAuth("login")}><Text style={styles.primaryButtonText}>Entrar</Text></Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => submitAuth("signup")}><Text style={styles.secondaryButtonText}>Criar conta</Text></Pressable>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>Mobile MVP</Text>
            <Text style={styles.title}>Hoje</Text>
            <Text style={styles.subtitle}>{session.user.email}</Text>
          </View>
          <Pressable style={styles.iconButton} onPress={() => supabase?.auth.signOut()}><Ionicons name="log-out-outline" size={22} color="#12355f" /></Pressable>
        </View>

        {screen === "today" ? <TodayScreen totals={totals} entries={foodEntries} /> : null}
        {screen === "log" ? <LogScreen foodForm={foodForm} setFoodForm={setFoodForm} scannedFood={scannedFood} addFood={addFood} /> : null}
        {screen === "scanner" ? <ScannerScreen scannerPermission={scannerPermission} scanLocked={scanLocked} openScanner={openScanner} handleBarcode={handleBarcode} /> : null}
        {screen === "fasting" ? <Placeholder title="Jejum" text="PrÃ³xima etapa: sincronizar timer e histÃ³rico do web." /> : null}
        {screen === "progress" ? <Placeholder title="Progresso" text="Peso, Ã¡gua e relatÃ³rios entrarÃ£o nas prÃ³ximas telas mobile." /> : null}
      </ScrollView>

      <View style={styles.tabBar}>
        <Tab icon="today-outline" label="Hoje" active={screen === "today"} onPress={() => setScreen("today")} />
        <Tab icon="add-circle-outline" label="Registrar" active={screen === "log"} onPress={() => setScreen("log")} />
        <Tab icon="barcode-outline" label="Scanner" active={screen === "scanner"} onPress={openScanner} />
        <Tab icon="time-outline" label="Jejum" active={screen === "fasting"} onPress={() => setScreen("fasting")} />
        <Tab icon="scale-outline" label="Progresso" active={screen === "progress"} onPress={() => setScreen("progress")} />
      </View>
    </SafeAreaView>
  );
}

function TodayScreen({ totals, entries }: { totals: { calories: number; protein: number; carbs: number; fat: number }; entries: FoodEntry[] }) {
  return <View><View style={styles.grid}><Metric label="Calorias" value={totals.calories} suffix="kcal" /><Metric label="ProteÃ­na" value={totals.protein} suffix="g" /><Metric label="Carbo." value={totals.carbs} suffix="g" /><Metric label="Gord." value={totals.fat} suffix="g" /></View><View style={styles.card}><Text style={styles.cardTitle}>DiÃ¡rio</Text>{entries.length === 0 ? <Text style={styles.muted}>Nenhum alimento registrado hoje.</Text> : null}{entries.map((entry) => <View key={entry.id} style={styles.entryRow}><View><Text style={styles.entryName}>{entry.name}</Text><Text style={styles.muted}>{mealLabels[entry.meal]} Â· {entry.quantity}{entry.unit} Â· P {entry.protein}g Â· C {entry.carbs}g Â· G {entry.fat}g</Text></View><Text style={styles.kcal}>{entry.calories} kcal</Text></View>)}</View></View>;
}

function LogScreen({ foodForm, setFoodForm, scannedFood, addFood }: { foodForm: typeof emptyFoodForm; setFoodForm: Dispatch<SetStateAction<typeof emptyFoodForm>>; scannedFood: BarcodeFood | null; addFood: () => void }) {
  return <View style={styles.card}><Text style={styles.cardTitle}>Registrar alimento</Text>{scannedFood ? <Text style={styles.success}>Produto lido pelo cÃ³digo de barras.</Text> : null}<TextInput style={styles.input} placeholder="Alimento" value={foodForm.name} onChangeText={(name) => setFoodForm((current) => ({ ...current, name }))} /><View style={styles.row}><TextInput style={[styles.input, styles.flex]} placeholder="Quantidade" keyboardType="numeric" value={foodForm.quantity} onChangeText={(quantity) => setFoodForm((current) => ({ ...current, quantity }))} /><TextInput style={[styles.input, styles.flex]} placeholder="Unidade" value={foodForm.unit} onChangeText={(unit) => setFoodForm((current) => ({ ...current, unit }))} /></View><View style={styles.row}><TextInput style={[styles.input, styles.flex]} placeholder="Kcal/100g" keyboardType="numeric" value={foodForm.calories} onChangeText={(calories) => setFoodForm((current) => ({ ...current, calories }))} /><TextInput style={[styles.input, styles.flex]} placeholder="ProteÃ­na" keyboardType="numeric" value={foodForm.protein} onChangeText={(protein) => setFoodForm((current) => ({ ...current, protein }))} /></View><View style={styles.row}><TextInput style={[styles.input, styles.flex]} placeholder="Carbo." keyboardType="numeric" value={foodForm.carbs} onChangeText={(carbs) => setFoodForm((current) => ({ ...current, carbs }))} /><TextInput style={[styles.input, styles.flex]} placeholder="Gord." keyboardType="numeric" value={foodForm.fat} onChangeText={(fat) => setFoodForm((current) => ({ ...current, fat }))} /></View><Pressable style={styles.primaryButton} onPress={addFood}><Text style={styles.primaryButtonText}>Adicionar ao diÃ¡rio</Text></Pressable></View>;
}

function ScannerScreen({ scannerPermission, scanLocked, openScanner, handleBarcode }: { scannerPermission: boolean | null; scanLocked: boolean; openScanner: () => void; handleBarcode: (code: string) => void }) {
  return <View style={styles.card}><Text style={styles.cardTitle}>CÃ³digo de barras</Text>{scannerPermission === false ? <Text style={styles.warning}>PermissÃ£o de cÃ¢mera negada.</Text> : null}{scannerPermission ? <View style={styles.scannerBox}><BarCodeScanner style={StyleSheet.absoluteFillObject} onBarCodeScanned={({ data }) => handleBarcode(data)} /></View> : <Pressable style={styles.primaryButton} onPress={openScanner}><Text style={styles.primaryButtonText}>Permitir cÃ¢mera</Text></Pressable>}{scanLocked ? <Text style={styles.muted}>Consultando produto...</Text> : null}</View>;
}

function Metric({ label, value, suffix }: { label: string; value: number; suffix: string }) {
  return <View style={styles.metricCard}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}<Text style={styles.metricSuffix}> {suffix}</Text></Text></View>;
}

function Tab({ icon, label, active, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; active: boolean; onPress: () => void }) {
  return <Pressable style={styles.tab} onPress={onPress}><Ionicons name={icon} size={22} color={active ? "#0066ee" : "#64748b"} /><Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text></Pressable>;
}

function Placeholder({ title, text }: { title: string; text: string }) {
  return <View style={styles.card}><Text style={styles.cardTitle}>{title}</Text><Text style={styles.muted}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f8fc" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f4f8fc" },
  authWrap: { flex: 1, justifyContent: "center", padding: 22 },
  content: { padding: 18, paddingBottom: 110 },
  logo: { width: 58, height: 58, borderRadius: 18, backgroundColor: "#0066ee", alignItems: "center", justifyContent: "center", marginBottom: 16 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  eyebrow: { color: "#0066ee", fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
  title: { color: "#111827", fontSize: 34, fontWeight: "900", letterSpacing: -1, marginTop: 4 },
  subtitle: { color: "#64748b", fontSize: 15, lineHeight: 22, marginTop: 4 },
  warning: { color: "#9a3412", backgroundColor: "#fff7ed", borderRadius: 14, padding: 12, marginBottom: 12, fontWeight: "700" },
  success: { color: "#166534", backgroundColor: "#f0fdf4", borderRadius: 14, padding: 12, marginBottom: 12, fontWeight: "700" },
  input: { minHeight: 48, borderRadius: 16, borderWidth: 1, borderColor: "#d7e3f2", backgroundColor: "#fff", paddingHorizontal: 14, marginBottom: 10, color: "#111827" },
  primaryButton: { minHeight: 50, borderRadius: 16, backgroundColor: "#0066ee", alignItems: "center", justifyContent: "center", marginTop: 4 },
  primaryButtonText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  secondaryButton: { minHeight: 50, borderRadius: 16, borderWidth: 1, borderColor: "#cfe0f4", backgroundColor: "#fff", alignItems: "center", justifyContent: "center", marginTop: 10 },
  secondaryButtonText: { color: "#12355f", fontWeight: "900", fontSize: 16 },
  iconButton: { width: 46, height: 46, borderRadius: 16, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#d7e3f2" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 12 },
  metricCard: { width: "48%", borderRadius: 20, backgroundColor: "#fff", padding: 14, borderWidth: 1, borderColor: "#dce7f4" },
  metricLabel: { color: "#64748b", fontSize: 12, fontWeight: "800" },
  metricValue: { color: "#111827", fontSize: 25, fontWeight: "900", marginTop: 8 },
  metricSuffix: { color: "#64748b", fontSize: 13 },
  card: { borderRadius: 22, backgroundColor: "#fff", padding: 16, borderWidth: 1, borderColor: "#dce7f4", marginBottom: 14 },
  cardTitle: { color: "#111827", fontSize: 18, fontWeight: "900", marginBottom: 10 },
  muted: { color: "#64748b", lineHeight: 21 },
  entryRow: { borderTopWidth: 1, borderTopColor: "#edf3fa", paddingVertical: 12, gap: 8 },
  entryName: { color: "#111827", fontWeight: "900", fontSize: 15 },
  kcal: { color: "#0066ee", fontWeight: "900" },
  row: { flexDirection: "row", gap: 10 },
  flex: { flex: 1 },
  scannerBox: { height: 360, overflow: "hidden", borderRadius: 22, backgroundColor: "#0f172a", marginTop: 8 },
  tabBar: { position: "absolute", left: 0, right: 0, bottom: 0, minHeight: 76, paddingTop: 8, paddingBottom: 12, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#dce7f4", flexDirection: "row", justifyContent: "space-around" },
  tab: { alignItems: "center", gap: 3, flex: 1 },
  tabText: { color: "#64748b", fontSize: 11, fontWeight: "800" },
  tabTextActive: { color: "#0066ee" }
});
