const { useState } = React;

const EDUCATION_RATES = {
  none:     { label: "بدون شهادة / ابتدائية / متوسطة / إعدادية", rate: 0 },
  diploma:  { label: "دبلوم", rate: 0.05 },
  bachelor: { label: "بكالوريوس", rate: 0.10 },
  master:   { label: "ماجستير", rate: 0.15 },
  phd:      { label: "دكتوراه", rate: 0.20 },
};

const SERVICE_TYPES = {
  civil:      "مدنية",
  military:   "عسكرية",
  private:    "قطاع خاص",
  political:  "فصل سياسي",
  daily:      "أجر يومي",
  contract:   "عقد",
};

let idCounter = 1;
function nextId() {
  return "svc_" + (idCounter++);
}

// يحسب عدد السنين (بالكسور العشرية) بين تاريخين
function yearsBetween(fromStr, toStr) {
  if (!fromStr || !toStr) return 0;
  const from = new Date(fromStr);
  const to = new Date(toStr);
  if (isNaN(from) || isNaN(to) || to < from) return 0;
  const msPerYear = 1000 * 60 * 60 * 24 * 365.25;
  return (to - from) / msPerYear;
}

// يحسب الفرق بين تاريخين بصيغة سنة/شهر/يوم تقويمية دقيقة
function dateDiffYMD(fromStr, toStr) {
  if (!fromStr || !toStr) return null;
  const from = new Date(fromStr);
  const to = new Date(toStr);
  if (isNaN(from) || isNaN(to) || to < from) return null;

  let years = to.getFullYear() - from.getFullYear();
  let months = to.getMonth() - from.getMonth();
  let days = to.getDate() - from.getDate();

  if (days < 0) {
    months -= 1;
    const prevMonth = new Date(to.getFullYear(), to.getMonth(), 0);
    days += prevMonth.getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return { years, months, days };
}

// يحوّل عدد سنين عشري (مثل خدمة مكتوبة بعدد السنين) إلى سنة/شهر/يوم تقريبية
function decimalYearsToYMD(decYears) {
  if (!decYears || decYears <= 0) return { years: 0, months: 0, days: 0 };
  const years = Math.floor(decYears);
  const remMonthsFloat = (decYears - years) * 12;
  const months = Math.floor(remMonthsFloat);
  const days = Math.round((remMonthsFloat - months) * 30.4375);
  return { years, months, days };
}

// تقريب الخدمة الكلية: كل 6 أشهر فأكثر مكتملة تُعتبر سنة كاملة
function roundServiceYears(decYears) {
  const years = Math.floor(decYears);
  const fractionMonths = (decYears - years) * 12;
  return fractionMonths >= 6 ? years + 1 : years;
}

function calculateRetirement({
  lastSalary,
  avgLast36,
  baseServiceYears,
  educationKey,
  allowances = 0,
  extraServices = [],
  leaveDays = 0,
  deduction = 0,
}) {
  const salaryAvg = avgLast36;

  // إجمالي سنوات الخدمات الإضافية (الخدمة العسكرية تُضاعف ×2 إذا فُعّل خيار المضاعفة)
  const extraYearsTotal = extraServices.reduce((sum, s) => {
    const years = s.years || 0;
    const effectiveYears = s.type === "military" && s.doubled ? years * 2 : years;
    return sum + effectiveYears;
  }, 0);

  // رصيد الإجازات يضاف كأيام تتحول لسنوات وتُضاف للخدمة الكلية
  const leaveYears = (leaveDays || 0) / 365.25;

  // الخدمة الكلية الخام (قبل التقريب)
  const totalServiceYearsRaw = baseServiceYears + extraYearsTotal + leaveYears;

  // قاعدة التقريب: كل 6 أشهر فأكثر تُعتبر سنة كاملة بالنسبة للخدمة النهائية المعتمدة في الحساب
  const totalServiceYears = roundServiceYears(totalServiceYearsRaw);

  // 1. الراتب التقاعدي = معدل الراتب × سنوات الخدمة الكلية (المُقرّبة) × 2.5%
  //    لا يجوز أن يتجاوز آخر راتب (الراتب الأسمى) - يجوز أن يساويه
  const basicPensionRaw = salaryAvg * totalServiceYears * 0.025;
  const basicPension = Math.min(basicPensionRaw, lastSalary);

  // 2. غلاء المعيشة = الراتب التقاعدي × سنوات الخدمة الكلية ÷ 100
  const costOfLiving = (basicPension * totalServiceYears) / 100;

  // 3. مخصص الشهادة = الراتب التقاعدي × نسبة الشهادة
  const eduRate = EDUCATION_RATES[educationKey]?.rate || 0;
  const educationAllowance = basicPension * eduRate;

  // 4. الراتب التقاعدي الكلي
  const totalPensionRaw = basicPension + costOfLiving + educationAllowance;
  const minPension = 400000; // الحد الأدنى
  const totalPension = Math.max(totalPensionRaw, minPension);
  const maxPension = lastSalary * 0.85; // الحد الأقصى (للعرض)

  // 5. مكافأة نهاية الخدمة = (آخر راتب أسمى + المخصصات) × 12 شهر
  //    شرط: إكمال 25 سنة خدمة كلية (المُقرّبة) على الأقل
  const gratuityEligible = totalServiceYears >= 25;
  const gratuityRaw = gratuityEligible ? (lastSalary + allowances) * 12 : 0;

  // خصم التوقيفات التقاعدية:
  // - إذا يستحق مكافأة: تُخصم مباشرة من مكافأة نهاية الخدمة
  // - إذا لا يستحق: تُخصم من ربع الراتب التقاعدي الكلي الشهري (معلومة عرض فقط)
  const ded = deduction || 0;
  const gratuity = Math.max(0, gratuityRaw - (gratuityEligible ? ded : 0));
  const quarterPension = totalPension / 4;
  const quarterPensionAfterDeduction = gratuityEligible ? quarterPension : Math.max(0, quarterPension - ded);

  return {
    salaryAvg,
    baseServiceYears,
    extraYearsTotal,
    leaveYears,
    totalServiceYearsRaw,
    totalServiceYears,
    basicPension,
    wasCapped: basicPensionRaw > lastSalary,
    costOfLiving,
    educationAllowance,
    eduRate,
    totalPension,
    wasMinApplied: totalPensionRaw < minPension,
    minPension,
    maxPension,
    gratuityRaw,
    gratuity,
    gratuityEligible,
    deduction: ded,
    quarterPension,
    quarterPensionAfterDeduction,
    allowances,
    eligible: totalServiceYears >= 15,
  };
}

function formatIQD(amount) {
  return Math.round(amount).toLocaleString("ar-IQ") + " د.ع";
}

function formatYears(y) {
  return y.toLocaleString("ar-IQ", { maximumFractionDigits: 2 });
}

// يعرض كائن {years, months, days} كنص "سنة شهر يوم"
function formatYMD(ymd) {
  if (!ymd) return "—";
  const parts = [];
  if (ymd.years > 0) parts.push(`${ymd.years} سنة`);
  if (ymd.months > 0) parts.push(`${ymd.months} شهر`);
  if (ymd.days > 0) parts.push(`${ymd.days} يوم`);
  if (parts.length === 0) return "0 يوم";
  return parts.join(" و ");
}

function App() {
  const [form, setForm] = useState({
    lastSalary: "",
    educationKey: "bachelor",
    allowances: "",
    leaveDays: "",
    deduction: "",
  });

  // طريقة إدخال معدل آخر 36 راتب: "direct" (يكتب المعدل مباشرة) أو "table" (جدول رواتب/أشهر)
  const [avgMode, setAvgMode] = useState("direct");
  const [avgDirectInput, setAvgDirectInput] = useState("");
  const [salaryRows, setSalaryRows] = useState([]);

  // طريقة إدخال الخدمة الأساسية: "years" أو "dates"
  const [baseServiceMode, setBaseServiceMode] = useState("years");
  const [baseServiceYearsInput, setBaseServiceYearsInput] = useState("");
  const [baseServiceFrom, setBaseServiceFrom] = useState("");
  const [baseServiceTo, setBaseServiceTo] = useState("");

  // الخدمات الإضافية (قائمة)
  const [extraServices, setExtraServices] = useState([]);

  const [result, setResult] = useState(null);
  const [aiExplanation, setAiExplanation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setResult(null);
    setAiExplanation("");
    setError("");
  };

  const addExtraService = () => {
    setExtraServices([
      ...extraServices,
      {
        id: nextId(),
        type: "civil",
        mode: "years",
        yearsInput: "",
        from: "",
        to: "",
        doubled: false,
      },
    ]);
    setResult(null);
  };

  const updateExtraService = (id, patch) => {
    setExtraServices(extraServices.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    setResult(null);
  };

  const removeExtraService = (id) => {
    setExtraServices(extraServices.filter((s) => s.id !== id));
    setResult(null);
  };

  // ----- جدول رواتب آخر 36 شهر -----
  const addSalaryRow = () => {
    setSalaryRows([...salaryRows, { id: nextId(), salary: "", months: "" }]);
    setResult(null);
  };

  const updateSalaryRow = (id, patch) => {
    setSalaryRows(salaryRows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setResult(null);
  };

  const removeSalaryRow = (id) => {
    setSalaryRows(salaryRows.filter((r) => r.id !== id));
    setResult(null);
  };

  const getSalaryRowsTotalMonths = () => {
    return salaryRows.reduce((sum, r) => sum + (parseFloat(r.months) || 0), 0);
  };

  const getSalaryRowsAverage = () => {
    const totalMonths = getSalaryRowsTotalMonths();
    if (totalMonths !== 36) return null;
    const totalAmount = salaryRows.reduce(
      (sum, r) => sum + (parseFloat(r.salary) || 0) * (parseFloat(r.months) || 0),
      0
    );
    return totalAmount / 36;
  };

  const getAvgLast36 = () => {
    if (avgMode === "direct") {
      return parseFloat(avgDirectInput) || 0;
    }
    return getSalaryRowsAverage() || 0;
  };

  const getBaseServiceYears = () => {
    if (baseServiceMode === "years") {
      return parseFloat(baseServiceYearsInput) || 0;
    }
    return yearsBetween(baseServiceFrom, baseServiceTo);
  };

  const getExtraServicesResolved = () => {
    return extraServices.map((s) => {
      const years = s.mode === "years" ? parseFloat(s.yearsInput) || 0 : yearsBetween(s.from, s.to);
      return { ...s, years };
    });
  };

  const handleCalculate = () => {
    const lastSalary = parseFloat(form.lastSalary);
    const educationKey = form.educationKey;
    const allowances = parseFloat(form.allowances) || 0;
    const leaveDays = parseFloat(form.leaveDays) || 0;

    const baseServiceYears = getBaseServiceYears();
    const resolvedExtra = getExtraServicesResolved();

    // التحقق من جدول الرواتب إذا كان هو وضع الإدخال المستخدم
    if (avgMode === "table") {
      const totalMonths = getSalaryRowsTotalMonths();
      if (salaryRows.length === 0) {
        setError("⚠️ يرجى إضافة فترات الرواتب لآخر 36 شهر");
        return;
      }
      if (totalMonths !== 36) {
        setError(`⚠️ مجموع الأشهر يجب أن يساوي 36 بالضبط — حالياً المجموع = ${totalMonths} شهر`);
        return;
      }
    }

    const avgLast36 = getAvgLast36();

    if (!lastSalary || !avgLast36 || !baseServiceYears) {
      setError("⚠️ يرجى تعبئة الراتب الأسمى، معدل آخر 36 راتب، ومدة الخدمة الأساسية");
      return;
    }

    const deduction = parseFloat(form.deduction) || 0;

    const res = calculateRetirement({
      lastSalary,
      avgLast36,
      baseServiceYears,
      educationKey,
      allowances,
      extraServices: resolvedExtra,
      leaveDays,
      deduction,
    });

    setResult(res);
    setAiExplanation("");
    fetchAIExplanation(res, {
      lastSalary,
      avgLast36,
      educationKey,
      allowances,
      leaveDays,
      extraServices: resolvedExtra,
      deduction: form.deduction,
    });
  };

  const fetchAIExplanation = async (res, inputs) => {
    setLoading(true);
    try {
      const educationLabel = EDUCATION_RATES[inputs.educationKey]?.label;
      const eduPct = (EDUCATION_RATES[inputs.educationKey]?.rate * 100).toFixed(0);

      const extraServicesText = inputs.extraServices.length
        ? inputs.extraServices
            .map((s) => {
              const doubledNote = s.type === "military" && s.doubled ? " (مُضاعفة ×2)" : "";
              return `- ${SERVICE_TYPES[s.type]}${doubledNote}: ${formatYears(s.years)} سنة`;
            })
            .join("\n")
        : "لا توجد";

      const hasDeduction = inputs.deduction && parseFloat(inputs.deduction) > 0;
      const deductionText = hasDeduction
        ? `${Math.round(parseFloat(inputs.deduction)).toLocaleString()} دينار`
        : "لم تُذكر";

      const deductionEffectText = !hasDeduction
        ? "لا يوجد خصم"
        : res.gratuityEligible
        ? `تُخصم مباشرة من مكافأة نهاية الخدمة (المكافأة بعد الخصم = ${Math.round(res.gratuity).toLocaleString()} دينار)`
        : `الموظف لا يستحق مكافأة، فتُخصم من ربع الراتب التقاعدي الكلي الشهري (ربع الراتب = ${Math.round(res.quarterPension).toLocaleString()} دينار، بعد الخصم = ${Math.round(res.quarterPensionAfterDeduction).toLocaleString()} دينار)`;

      const prompt = `أنت خبير في قانون التقاعد العراقي رقم 9 لسنة 2014 وتعديله رقم 26 لسنة 2019.
اشرح نتيجة حساب الراتب التقاعدي التالية بالعربية بأسلوب واضح ومبسط:

المدخلات:
- الراتب الأسمى الأخير: ${Math.round(inputs.lastSalary).toLocaleString()} دينار
- معدل آخر 36 راتب: ${Math.round(inputs.avgLast36).toLocaleString()} دينار
- الخدمة الوظيفية الأساسية: ${formatYears(res.baseServiceYears)} سنة
- خدمات إضافية:
${extraServicesText}
- رصيد إجازات: ${inputs.leaveDays} يوم (= ${formatYears(res.leaveYears)} سنة)
- إجمالي الخدمة الكلية قبل التقريب: ${formatYears(res.totalServiceYearsRaw)} سنة
- إجمالي الخدمة الكلية المعتمدة بعد قاعدة (6 أشهر فأكثر = سنة كاملة): ${res.totalServiceYears} سنة
- الشهادة: ${educationLabel} (${eduPct}%)
- استقطاع توقيفات تقاعدية مذكور: ${deductionText}

آلية الحساب المطبقة:
1. الراتب التقاعدي الأساسي = معدل الراتب × إجمالي سنوات الخدمة المعتمدة × 2.5% (بحد أقصى = آخر راتب) = ${Math.round(res.basicPension).toLocaleString()} دينار
2. غلاء المعيشة = الراتب التقاعدي × إجمالي سنوات الخدمة المعتمدة ÷ 100 = ${Math.round(res.costOfLiving).toLocaleString()} دينار
3. مخصص الشهادة = الراتب التقاعدي × ${eduPct}% = ${Math.round(res.educationAllowance).toLocaleString()} دينار
4. الراتب الكلي (بحد أدنى 400,000) = ${Math.round(res.totalPension).toLocaleString()} دينار
5. مكافأة نهاية الخدمة (تتطلب 25 سنة خدمة كلية) = ${res.gratuityEligible ? Math.round(res.gratuityRaw).toLocaleString() + " دينار قبل الخصم" : "غير مستحقة"}
6. أثر الاستقطاع: ${deductionEffectText}

اشرح الحساب خطوة بخطوة بشكل واضح ومبسط، مع التنويه على كيفية حساب الخدمة الكلية من مجموع المصادر وقاعدة تقريب الأشهر، وكيفية تطبيق الاستقطاع. كن موجزاً (4-5 فقرات).`;

      const apiKey = localStorage.getItem("claude_api_key");
      if (!apiKey) {
        setAiExplanation(
          "⚙️ شرح الذكاء الاصطناعي يحتاج مفتاح Anthropic API. اضغط على زر \"⚙️ إعداد مفتاح API\" بالأسفل لإضافته (يُحفظ على جهازك فقط ولا يُرسل لأي مكان آخر)."
        );
        setLoading(false);
        return;
      }

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error("API error: " + response.status + " " + errBody);
      }

      const data = await response.json();
      const text = data.content?.map((b) => b.text || "").join("") || "تعذّر جلب الشرح.";
      setAiExplanation(text);
    } catch (e) {
      setAiExplanation(
        "⚠️ تعذّر الاتصال بالذكاء الاصطناعي لشرح النتيجة. تأكد من صحة مفتاح API ومن وجود اتصال بالإنترنت.\n\n(" + e.message + ")"
      );
    }
    setLoading(false);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #0a1628 0%, #1a2f4e 50%, #0d2137 100%)",
        fontFamily: "'Segoe UI', Tahoma, sans-serif",
        direction: "rtl",
        padding: "24px 16px",
        color: "#e8edf4",
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ color: "#5a7a9a", fontSize: 12, marginBottom: 10, letterSpacing: 0.5 }}>
            إعداد: عباس علي عزيز
          </div>
          <div
            style={{
              display: "inline-block",
              background: "linear-gradient(135deg, #c8a84b, #e8c96d)",
              borderRadius: 12,
              padding: "10px 20px",
              marginBottom: 14,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, color: "#0a1628", letterSpacing: 1 }}>
              قانون التقاعد رقم 9 لسنة 2014 + تعديل 26/2019
            </span>
          </div>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 800,
              margin: 0,
              background: "linear-gradient(90deg, #c8a84b, #f0d87a, #c8a84b)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            حاسبة الراتب التقاعدي
          </h1>
          <p style={{ color: "#8faabf", fontSize: 14, marginTop: 6 }}>
            الجمهورية العراقية — هيئة التقاعد الوطنية
          </p>
        </div>

        {/* بيانات الراتب */}
        <SectionCard title="💵 بيانات الراتب">
          <div style={{ display: "grid", gap: 16 }}>
            <InputField
              label="الراتب الأسمى الأخير (دينار)"
              name="lastSalary"
              value={form.lastSalary}
              onChange={handleChange}
              placeholder="مثال: 850000"
            />
            <InputField
              label="المخصصات (دينار) — تُستخدم في مكافأة نهاية الخدمة فقط"
              name="allowances"
              value={form.allowances}
              onChange={handleChange}
              placeholder="مثال: 150000 — اتركه فارغاً إذا لا يوجد"
            />
            <InputField
              label="استقطاع التوقيفات التقاعدية (دينار) — معلومة للعرض فقط"
              name="deduction"
              value={form.deduction}
              onChange={handleChange}
              placeholder="مثال: 45000 — اختياري"
            />
            <div>
              <label style={labelStyle}>الشهادة الدراسية</label>
              <select
                name="educationKey"
                value={form.educationKey}
                onChange={handleChange}
                style={selectStyle}
              >
                {Object.entries(EDUCATION_RATES).map(([k, v]) => (
                  <option key={k} value={k} style={{ background: "#1a2f4e" }}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </SectionCard>

        {/* معدل آخر 36 راتب */}
        <SectionCard title="📈 معدل آخر 36 راتب">
          <ModeToggle
            mode={avgMode}
            onChange={setAvgMode}
            labelYears="أكتب المعدل مباشرة"
            labelDates="جدول رواتب (مع تكرار)"
          />

          {avgMode === "direct" ? (
            <InputField
              label="معدل آخر 36 راتب (دينار)"
              name="avgDirectInput"
              value={avgDirectInput}
              onChange={(e) => {
                setAvgDirectInput(e.target.value);
                setResult(null);
              }}
              placeholder="مثال: 780000"
            />
          ) : (
            <>
              <div style={{ color: "#8faabf", fontSize: 12, marginBottom: 12 }}>
                أضف كل راتب مع عدد الأشهر التي استلمته فيها، حتى يصير المجموع 36 شهر بالضبط.
              </div>

              {salaryRows.length === 0 && (
                <div style={{ color: "#8faabf", fontSize: 13, marginBottom: 12 }}>
                  لا توجد فترات رواتب مُضافة بعد
                </div>
              )}

              <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
                {salaryRows.map((row, idx) => (
                  <div
                    key={row.id}
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 10,
                      padding: 12,
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr auto",
                      gap: 8,
                      alignItems: "end",
                    }}
                  >
                    <InputField
                      label={`الراتب #${idx + 1} (دينار)`}
                      name="salary"
                      value={row.salary}
                      onChange={(e) => updateSalaryRow(row.id, { salary: e.target.value })}
                      placeholder="مثال: 750000"
                    />
                    <InputField
                      label="عدد الأشهر"
                      name="months"
                      value={row.months}
                      onChange={(e) => updateSalaryRow(row.id, { months: e.target.value })}
                      placeholder="مثال: 10"
                    />
                    <button
                      onClick={() => removeSalaryRow(row.id)}
                      style={{
                        background: "rgba(255,100,100,0.15)",
                        border: "1px solid rgba(255,100,100,0.3)",
                        borderRadius: 6,
                        color: "#ff8080",
                        fontSize: 12,
                        padding: "10px 12px",
                        cursor: "pointer",
                        height: 46,
                      }}
                    >
                      🗑
                    </button>
                  </div>
                ))}
              </div>

              <button onClick={addSalaryRow} style={addButtonStyle}>
                ➕ إضافة فترة راتب
              </button>

              {salaryRows.length > 0 && (
                <div
                  style={{
                    ...computedHint,
                    marginTop: 14,
                    background:
                      getSalaryRowsTotalMonths() === 36 ? "rgba(76,175,80,0.1)" : "rgba(255,152,0,0.1)",
                    color: getSalaryRowsTotalMonths() === 36 ? "#81c784" : "#ffb74d",
                  }}
                >
                  📊 مجموع الأشهر حتى الآن: {getSalaryRowsTotalMonths()} / 36
                  {getSalaryRowsTotalMonths() === 36 && getSalaryRowsAverage() !== null && (
                    <span> ✅ المعدل المحسوب: {formatIQD(getSalaryRowsAverage())}</span>
                  )}
                </div>
              )}
            </>
          )}
        </SectionCard>

        {/* الخدمة الوظيفية الأساسية */}
        <SectionCard title="🧾 الخدمة الوظيفية الأساسية">
          <ModeToggle
            mode={baseServiceMode}
            onChange={setBaseServiceMode}
            labelYears="عدد السنين"
            labelDates="من تاريخ - إلى تاريخ"
          />

          {baseServiceMode === "years" ? (
            <InputField
              label="مدة الخدمة الأساسية (سنوات)"
              name="baseServiceYearsInput"
              value={baseServiceYearsInput}
              onChange={(e) => {
                setBaseServiceYearsInput(e.target.value);
                setResult(null);
              }}
              placeholder="مثال: 28"
            />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <DateField
                label="من تاريخ"
                value={baseServiceFrom}
                onChange={(e) => {
                  setBaseServiceFrom(e.target.value);
                  setResult(null);
                }}
              />
              <DateField
                label="إلى تاريخ"
                value={baseServiceTo}
                onChange={(e) => {
                  setBaseServiceTo(e.target.value);
                  setResult(null);
                }}
              />
            </div>
          )}

          {baseServiceMode === "dates" && baseServiceFrom && baseServiceTo && (
            <div style={computedHint}>
              ⏱ المدة المحسوبة: {formatYMD(dateDiffYMD(baseServiceFrom, baseServiceTo))}
            </div>
          )}
        </SectionCard>

        {/* رصيد الإجازات */}
        <SectionCard title="🌴 رصيد الإجازات">
          <InputField
            label="رصيد الإجازات (أيام) — تُضاف إلى الخدمة الكلية"
            name="leaveDays"
            value={form.leaveDays}
            onChange={handleChange}
            placeholder="مثال: 90"
          />
          {form.leaveDays && (
            <div style={computedHint}>
              ⏱ يعادل: {formatYMD(decimalYearsToYMD((parseFloat(form.leaveDays) || 0) / 365.25))} تُضاف للخدمة الكلية
            </div>
          )}
        </SectionCard>

        {/* الخدمات الإضافية */}
        <SectionCard title="🗂️ خدمات إضافية (تُضاف إلى الخدمة الكلية)">
          {extraServices.length === 0 && (
            <div style={{ color: "#8faabf", fontSize: 13, marginBottom: 12 }}>
              لا توجد خدمات إضافية مُضافة بعد
            </div>
          )}

          <div style={{ display: "grid", gap: 14 }}>
            {extraServices.map((s, idx) => (
              <ExtraServiceRow
                key={s.id}
                index={idx}
                service={s}
                onUpdate={(patch) => updateExtraService(s.id, patch)}
                onRemove={() => removeExtraService(s.id)}
              />
            ))}
          </div>

          <button onClick={addExtraService} style={addButtonStyle}>
            ➕ إضافة خدمة
          </button>
        </SectionCard>

        {error && (
          <div style={{ color: "#ff6b6b", fontSize: 13, marginBottom: 16, textAlign: "center" }}>
            {error}
          </div>
        )}

        <button onClick={handleCalculate} style={calcButtonStyle}>
          ⚡ احسب الراتب التقاعدي
        </button>

        {/* Results */}
        {result && (
          <SectionCard title="📊 نتائج الحساب" marginTop={20}>
            {!result.eligible ? (
              <div style={ineligibleBox}>
                ⛔ مدة الخدمة الكلية ({result.totalServiceYears} سنة بعد التقريب) أقل من 15 سنة — لا
                يستحق الراتب التقاعدي بموجب القانون
              </div>
            ) : (
              <>
                {/* تفصيل الخدمة الكلية */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, color: "#c8a84b", marginBottom: 8, fontWeight: 700 }}>
                    تفصيل الخدمة الكلية
                  </div>
                  <div style={{ display: "grid", gap: 8 }}>
                    <ResultRow
                      label="الخدمة الوظيفية الأساسية"
                      value={formatYMD(decimalYearsToYMD(result.baseServiceYears))}
                    />
                    {result.extraYearsTotal > 0 && (
                      <ResultRow
                        label="إجمالي الخدمات الإضافية"
                        value={formatYMD(decimalYearsToYMD(result.extraYearsTotal))}
                      />
                    )}
                    {result.leaveYears > 0 && (
                      <ResultRow
                        label="رصيد الإجازات المُضاف"
                        value={formatYMD(decimalYearsToYMD(result.leaveYears))}
                      />
                    )}
                    <ResultRow
                      label="إجمالي الخدمة الكلية (قبل التقريب)"
                      value={formatYMD(decimalYearsToYMD(result.totalServiceYearsRaw))}
                    />
                    <ResultRow
                      label="إجمالي الخدمة الكلية المعتمدة (بعد تقريب 6 أشهر)"
                      value={`${result.totalServiceYears} سنة`}
                      highlight
                    />
                  </div>
                  <div style={computedHint}>
                    📌 قاعدة التقريب: كل 6 أشهر فأكثر من الكسر تُعتبر سنة كاملة، وما دونها يُهمل، عند حساب الراتب التقاعدي.
                  </div>
                </div>

                <div style={dividerStyle} />

                {/* تفاصيل الراتب */}
                <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
                  <ResultRow label="معدل آخر 36 راتب" value={formatIQD(result.salaryAvg)} />
                  <ResultRow
                    label={`الراتب التقاعدي الأساسي (${result.totalServiceYears} سنة × 2.5%${
                      result.wasCapped ? " — سقّفناه بآخر راتب" : ""
                    })`}
                    value={formatIQD(result.basicPension)}
                    highlight
                  />
                  <ResultRow
                    label={`غلاء المعيشة (× ${result.totalServiceYears} ÷ 100)`}
                    value={formatIQD(result.costOfLiving)}
                  />
                  <ResultRow
                    label={`مخصص الشهادة (${EDUCATION_RATES[form.educationKey]?.label} — ${(
                      result.eduRate * 100
                    ).toFixed(0)}%)`}
                    value={formatIQD(result.educationAllowance)}
                  />
                </div>

                <div style={dividerStyle} />

                {/* الحد الأدنى والأقصى */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                  <MiniCard label="الحد الأدنى" value={formatIQD(result.minPension)} color="#4a9eff" />
                  <MiniCard label="الحد الأقصى (85% أسمى)" value={formatIQD(result.maxPension)} color="#ff7b4a" />
                </div>

                {/* الإجمالي النهائي */}
                <div style={totalBox}>
                  <div style={{ color: "#81c784", fontSize: 13, marginBottom: 6 }}>
                    💰 الراتب التقاعدي الكلي
                  </div>
                  <div style={{ color: "#a5d6a7", fontWeight: 900, fontSize: 30 }}>
                    {formatIQD(result.totalPension)}
                  </div>
                  {result.wasMinApplied && (
                    <div style={{ color: "#81c784", fontSize: 11, marginTop: 6, opacity: 0.8 }}>
                      * طُبِّق الحد الأدنى (400,000 د.ع)
                    </div>
                  )}
                </div>

                {/* مكافأة نهاية الخدمة */}
                <div style={gratuityBox(result.gratuityEligible)}>
                  <div
                    style={{
                      fontSize: 13,
                      marginBottom: 6,
                      color: result.gratuityEligible ? "#90caf9" : "#8faabf",
                    }}
                  >
                    🏆 مكافأة نهاية الخدمة
                  </div>
                  {result.gratuityEligible ? (
                    <>
                      <div style={{ color: "#bbdefb", fontWeight: 900, fontSize: 26 }}>
                        {formatIQD(result.gratuity)}
                      </div>
                      <div style={{ color: "#64b5f6", fontSize: 11, marginTop: 5 }}>
                        (آخر راتب {formatIQD(result.gratuity / 12 - result.allowances >= 0 ? result.gratuityRaw / 12 - result.allowances : 0)} + مخصصات{" "}
                        {formatIQD(result.allowances)}) × 12 شهر = {formatIQD(result.gratuityRaw)}
                      </div>
                      {result.deduction > 0 && (
                        <div style={{ color: "#ffb74d", fontSize: 12, marginTop: 8, background: "rgba(255,183,77,0.1)", borderRadius: 8, padding: "8px 10px" }}>
                          ⚠️ خُصم {formatIQD(result.deduction)} (توقيفات تقاعدية) من المكافأة مباشرة
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ color: "#ff8080", fontSize: 13 }}>
                      ⛔ غير مستحقة — تحتاج إكمال 25 سنة خدمة كلية
                      <div style={{ color: "#8faabf", fontSize: 11, marginTop: 4 }}>
                        متبقي: {Math.max(0, 25 - result.totalServiceYears)} سنة
                      </div>
                      {result.deduction > 0 && (
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                          <div style={{ color: "#90caf9", fontSize: 12, marginBottom: 4 }}>
                            بدل ذلك، يُخصم من ربع الراتب التقاعدي الكلي الشهري:
                          </div>
                          <div style={{ color: "#bbdefb", fontWeight: 700, fontSize: 16 }}>
                            ربع الراتب: {formatIQD(result.quarterPension)} ← بعد الخصم: {formatIQD(result.quarterPensionAfterDeduction)}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </SectionCard>
        )}

        {/* AI Explanation */}
        {(loading || aiExplanation) && (
          <SectionCard title="🤖 شرح الذكاء الاصطناعي" marginTop={20} accent="#64a0ff">
            {loading ? (
              <div style={{ color: "#8faabf", fontSize: 14, textAlign: "center", padding: "20px 0" }}>
                <span style={{ display: "block", marginBottom: 8 }}>⏳</span>
                جاري تحليل النتيجة...
              </div>
            ) : (
              <div style={{ color: "#ccd9e8", fontSize: 14, lineHeight: 1.9, whiteSpace: "pre-wrap" }}>
                {aiExplanation}
              </div>
            )}
          </SectionCard>
        )}

        <div style={{ textAlign: "center", marginTop: 20 }}>
          <button
            onClick={() => {
              const current = localStorage.getItem("claude_api_key") || "";
              const input = window.prompt(
                "أدخل مفتاح Anthropic API (يُحفظ على جهازك فقط، اتركه فارغاً للحذف):",
                current
              );
              if (input !== null) {
                if (input.trim() === "") {
                  localStorage.removeItem("claude_api_key");
                  window.alert("تم حذف المفتاح.");
                } else {
                  localStorage.setItem("claude_api_key", input.trim());
                  window.alert("تم حفظ المفتاح بنجاح.");
                }
              }
            }}
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 8,
              color: "#8faabf",
              fontSize: 12,
              padding: "8px 16px",
              cursor: "pointer",
            }}
          >
            ⚙️ إعداد مفتاح API (لتفعيل شرح الذكاء الاصطناعي)
          </button>
        </div>

        <div style={{ textAlign: "center", marginTop: 12, color: "#4a6480", fontSize: 12 }}>
          الأرقام تقديرية — يُنصح بمراجعة هيئة التقاعد الوطنية للتأكيد الرسمي
        </div>
      </div>
    </div>
  );
}

/* ---------- Reusable UI pieces ---------- */

const labelStyle = { display: "block", fontSize: 13, color: "#8faabf", marginBottom: 6 };

const inputStyle = {
  width: "100%",
  padding: "12px 14px",
  background: "rgba(255,255,255,0.07)",
  border: "1px solid rgba(200,168,75,0.3)",
  borderRadius: 10,
  color: "#e8edf4",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};

const selectStyle = { ...inputStyle, cursor: "pointer" };

const computedHint = {
  marginTop: 10,
  fontSize: 12,
  color: "#90caf9",
  background: "rgba(74,158,255,0.08)",
  borderRadius: 8,
  padding: "8px 12px",
};

const dividerStyle = { borderTop: "1px solid rgba(200,168,75,0.2)", paddingTop: 14, marginBottom: 14 };

const addButtonStyle = {
  marginTop: 14,
  width: "100%",
  padding: "10px",
  background: "rgba(74,158,255,0.12)",
  border: "1px dashed rgba(74,158,255,0.4)",
  borderRadius: 10,
  color: "#90caf9",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
};

const calcButtonStyle = {
  width: "100%",
  padding: "14px",
  background: "linear-gradient(135deg, #c8a84b, #e8c96d)",
  border: "none",
  borderRadius: 10,
  color: "#0a1628",
  fontWeight: 800,
  fontSize: 16,
  cursor: "pointer",
  letterSpacing: 0.5,
  marginBottom: 4,
};

const ineligibleBox = {
  background: "rgba(255,100,100,0.1)",
  border: "1px solid rgba(255,100,100,0.3)",
  borderRadius: 10,
  padding: 16,
  color: "#ff8080",
  textAlign: "center",
};

const totalBox = {
  background: "linear-gradient(135deg, #1a3a1a, #0d2810)",
  border: "2px solid #4CAF50",
  borderRadius: 14,
  padding: "20px 24px",
  textAlign: "center",
  marginBottom: 12,
};

function gratuityBox(eligible) {
  return {
    background: eligible ? "linear-gradient(135deg, #1a2a3a, #0d1e2e)" : "rgba(255,255,255,0.03)",
    border: eligible ? "2px solid #4a9eff" : "1px solid rgba(255,255,255,0.1)",
    borderRadius: 14,
    padding: "20px 24px",
    textAlign: "center",
  };
}

function SectionCard({ title, children, marginTop = 0, accent = "#c8a84b" }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.05)",
        border: `1px solid ${accent}40`,
        borderRadius: 16,
        padding: "24px 22px",
        marginBottom: 20,
        marginTop,
        backdropFilter: "blur(10px)",
      }}
    >
      <h2 style={{ fontSize: 15, color: accent, marginTop: 0, marginBottom: 18 }}>{title}</h2>
      {children}
    </div>
  );
}

function InputField({ label, name, value, onChange, placeholder, type = "text" }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        style={inputStyle}
      />
    </div>
  );
}

function DateField({ label, value, onChange }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input type="date" value={value} onChange={onChange} style={inputStyle} />
    </div>
  );
}

function ModeToggle({ mode, onChange, labelYears, labelDates }) {
  const base = {
    flex: 1,
    padding: "10px",
    borderRadius: 9,
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    textAlign: "center",
    border: "1px solid rgba(200,168,75,0.3)",
  };
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
      <div
        onClick={() => onChange("years")}
        style={{
          ...base,
          background: mode === "years" ? "linear-gradient(135deg, #c8a84b, #e8c96d)" : "rgba(255,255,255,0.05)",
          color: mode === "years" ? "#0a1628" : "#8faabf",
        }}
      >
        {labelYears}
      </div>
      <div
        onClick={() => onChange("dates")}
        style={{
          ...base,
          background: mode === "dates" ? "linear-gradient(135deg, #c8a84b, #e8c96d)" : "rgba(255,255,255,0.05)",
          color: mode === "dates" ? "#0a1628" : "#8faabf",
        }}
      >
        {labelDates}
      </div>
    </div>
  );
}

function ExtraServiceRow({ index, service, onUpdate, onRemove }) {
  const computedYears =
    service.mode === "dates" ? yearsBetween(service.from, service.to) : parseFloat(service.yearsInput) || 0;

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 12,
        padding: 14,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 13, color: "#c8a84b", fontWeight: 700 }}>خدمة #{index + 1}</span>
        <button
          onClick={onRemove}
          style={{
            background: "rgba(255,100,100,0.15)",
            border: "1px solid rgba(255,100,100,0.3)",
            borderRadius: 6,
            color: "#ff8080",
            fontSize: 12,
            padding: "4px 10px",
            cursor: "pointer",
          }}
        >
          🗑 حذف
        </button>
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={labelStyle}>نوع الخدمة</label>
        <select
          value={service.type}
          onChange={(e) => onUpdate({ type: e.target.value })}
          style={selectStyle}
        >
          {Object.entries(SERVICE_TYPES).map(([k, v]) => (
            <option key={k} value={k} style={{ background: "#1a2f4e" }}>
              {v}
            </option>
          ))}
        </select>
      </div>

      {service.type === "military" && (
        <div
          onClick={() => onUpdate({ doubled: !service.doubled })}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: service.doubled ? "rgba(74,158,255,0.15)" : "rgba(255,255,255,0.04)",
            border: service.doubled ? "1px solid rgba(74,158,255,0.5)" : "1px solid rgba(255,255,255,0.1)",
            borderRadius: 9,
            padding: "10px 14px",
            marginBottom: 12,
            cursor: "pointer",
          }}
        >
          <span style={{ fontSize: 13, color: service.doubled ? "#90caf9" : "#8faabf" }}>
            ⚔️ مضاعفة الخدمة العسكرية (×2)
          </span>
          <span
            style={{
              width: 38,
              height: 22,
              borderRadius: 11,
              background: service.doubled ? "#4a9eff" : "rgba(255,255,255,0.15)",
              position: "relative",
              transition: "background 0.2s",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 2,
                left: service.doubled ? 18 : 2,
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: "#fff",
                transition: "left 0.2s",
              }}
            />
          </span>
        </div>
      )}

      <ModeToggle
        mode={service.mode}
        onChange={(m) => onUpdate({ mode: m })}
        labelYears="عدد السنين"
        labelDates="من - إلى"
      />

      {service.mode === "years" ? (
        <InputField
          label="عدد السنوات"
          name="yearsInput"
          value={service.yearsInput}
          onChange={(e) => onUpdate({ yearsInput: e.target.value })}
          placeholder="مثال: 3"
        />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <DateField label="من تاريخ" value={service.from} onChange={(e) => onUpdate({ from: e.target.value })} />
          <DateField label="إلى تاريخ" value={service.to} onChange={(e) => onUpdate({ to: e.target.value })} />
        </div>
      )}

      {computedYears > 0 && (
        <div style={computedHint}>
          ⏱ المدة المحسوبة: {formatYMD(decimalYearsToYMD(computedYears))}
          {service.type === "military" && service.doubled && (
            <span> ← بعد المضاعفة ×2: {formatYMD(decimalYearsToYMD(computedYears * 2))}</span>
          )}
        </div>
      )}
    </div>
  );
}

function ResultRow({ label, value, highlight }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "10px 14px",
        background: highlight ? "rgba(200,168,75,0.08)" : "rgba(255,255,255,0.03)",
        borderRadius: 8,
      }}
    >
      <span style={{ color: "#8faabf", fontSize: 13 }}>{label}</span>
      <span
        style={{
          color: highlight ? "#e8c96d" : "#e8edf4",
          fontWeight: highlight ? 700 : 500,
          fontSize: 14,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function MiniCard({ label, value, color }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.04)",
        border: `1px solid ${color}44`,
        borderRadius: 10,
        padding: "12px",
        textAlign: "center",
      }}
    >
      <div style={{ color: color, fontSize: 11, marginBottom: 4 }}>{label}</div>
      <div style={{ color: "#e8edf4", fontWeight: 700, fontSize: 13 }}>{value}</div>
    </div>
  );
}


// تركيب التطبيق
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
