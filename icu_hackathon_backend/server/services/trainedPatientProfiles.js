const TRAINED_PATIENT_PROFILES = Object.freeze({
  "901": {
    patientId: "901",
    patientName: "Aarohi Mehta",
    age: 64,
    sex: "Female",
    wardBed: "ICU-A3",
    diagnosis: "Sepsis with respiratory distress",
    heartRate: 128,
    spo2: 86,
    temperature: 101.7,
    bloodPressure: "92/58",
    respiratoryRate: 32,
    map: 61,
    lactate: 3.8,
    urineOutputMlHr: 20,
    ventilatorMode: "BiPAP",
    fio2: 0.62,
    trend: "Worsening in last 2 hours",
    riskLevel: "CRITICAL",
    predictedRiskNext5Minutes: "CRITICAL",
    recommendedAction:
      "Initiate sepsis bundle, blood cultures, broad-spectrum antibiotics, and prepare vasopressor support.",
    lastUpdated: "2026-04-15T07:40:00.000Z",
  },
  "902": {
    patientId: "902",
    patientName: "Raghav Iyer",
    age: 52,
    sex: "Male",
    wardBed: "ICU-B1",
    diagnosis: "Post-operative cardiac monitoring",
    heartRate: 108,
    spo2: 93,
    temperature: 99.4,
    bloodPressure: "108/68",
    respiratoryRate: 24,
    map: 79,
    lactate: 2.1,
    urineOutputMlHr: 35,
    ventilatorMode: "Nasal oxygen",
    fio2: 0.4,
    trend: "Fluctuating but currently improving",
    riskLevel: "MODERATE",
    predictedRiskNext5Minutes: "MODERATE",
    recommendedAction:
      "Continue close telemetry and oxygen titration; repeat ABG if saturation drops below 92.",
    lastUpdated: "2026-04-15T07:42:00.000Z",
  },
  "903": {
    patientId: "903",
    patientName: "Noor Fatima",
    age: 39,
    sex: "Female",
    wardBed: "ICU-C2",
    diagnosis: "Severe pneumonia under treatment",
    heartRate: 96,
    spo2: 97,
    temperature: 98.9,
    bloodPressure: "118/74",
    respiratoryRate: 18,
    map: 88,
    lactate: 1.4,
    urineOutputMlHr: 50,
    ventilatorMode: "Room air",
    fio2: 0.21,
    trend: "Stable and recovering",
    riskLevel: "WARNING",
    predictedRiskNext5Minutes: "STABLE",
    recommendedAction:
      "Maintain current antibiotics and physiotherapy; continue routine monitoring for 6-hour trend.",
    lastUpdated: "2026-04-15T07:39:00.000Z",
  },
});

function getTrainedPatientProfile(patientId) {
  const key = String(patientId || "").trim();
  const profile = TRAINED_PATIENT_PROFILES[key];
  return profile ? { ...profile } : null;
}

function listTrainedPatientProfiles() {
  return Object.values(TRAINED_PATIENT_PROFILES).map((row) => ({ ...row }));
}

function listTrainedPatientIds() {
  return Object.keys(TRAINED_PATIENT_PROFILES);
}

module.exports = {
  getTrainedPatientProfile,
  listTrainedPatientProfiles,
  listTrainedPatientIds,
};

