from pathlib import Path
import pickle

import pandas as pd
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler
from xgboost import XGBClassifier


FEATURE_COLUMNS = [
    "heart_rate",
    "spo2",
    "temperature",
    "systolic_bp",
    "diastolic_bp",
];
TARGET_COLUMN = "risk_label"


def train_and_save_model() -> None:
    base_dir = Path(__file__).resolve().parent
    dataset_path = base_dir / "icu_dataset.csv"
    model_path = base_dir / "xgb_forecasting.json"
    scaler_path = base_dir / "scaler.pkl"

    if not dataset_path.exists():
        raise FileNotFoundError(f"Dataset not found: {dataset_path}")

    df = pd.read_csv(dataset_path)

    required_columns = FEATURE_COLUMNS + [TARGET_COLUMN]
    missing_columns = [col for col in required_columns if col not in df.columns]
    if missing_columns:
        raise ValueError(f"Missing required columns: {missing_columns}")

    df = df[required_columns].dropna()
    if df.empty:
        raise ValueError("Dataset has no usable rows after dropping missing values.")

    x = df[FEATURE_COLUMNS].astype(float)
    y_raw = df[TARGET_COLUMN]

    label_encoder = LabelEncoder()
    y = label_encoder.fit_transform(y_raw)
    class_count = len(label_encoder.classes_)

    stratify_target = y if class_count > 1 else None
    x_train, x_test, y_train, y_test = train_test_split(
        x,
        y,
        test_size=0.2,
        random_state=42,
        stratify=stratify_target,
    )

    scaler = StandardScaler()
    x_train_scaled = scaler.fit_transform(x_train)
    x_test_scaled = scaler.transform(x_test)

    if class_count <= 2:
        model = XGBClassifier(
            n_estimators=300,
            learning_rate=0.05,
            max_depth=4,
            subsample=0.9,
            colsample_bytree=0.9,
            random_state=42,
            objective="binary:logistic",
            eval_metric="logloss",
        )
    else:
        model = XGBClassifier(
            n_estimators=300,
            learning_rate=0.05,
            max_depth=4,
            subsample=0.9,
            colsample_bytree=0.9,
            random_state=42,
            objective="multi:softprob",
            num_class=class_count,
            eval_metric="mlogloss",
        )

    model.fit(x_train_scaled, y_train)
    y_pred = model.predict(x_test_scaled)

    accuracy = accuracy_score(y_test, y_pred)
    precision = precision_score(y_test, y_pred, average="weighted", zero_division=0)
    recall = recall_score(y_test, y_pred, average="weighted", zero_division=0)
    f1 = f1_score(y_test, y_pred, average="weighted", zero_division=0)

    print(f"Accuracy:  {accuracy:.4f}")
    print(f"Precision: {precision:.4f}")
    print(f"Recall:    {recall:.4f}")
    print(f"F1 Score:  {f1:.4f}")

    model.save_model(str(model_path))
    with scaler_path.open("wb") as scaler_file:
        pickle.dump(scaler, scaler_file)

    print(f"Model saved to:  {model_path}")
    print(f"Scaler saved to: {scaler_path}")


if __name__ == "__main__":
    train_and_save_model()
