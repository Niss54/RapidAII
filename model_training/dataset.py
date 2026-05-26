from pathlib import Path
import csv
import random


ROW_COUNT = 1000
RANDOM_SEED = 42


def assign_risk_label(spo2: int, systolic_bp: int) -> str:
    if spo2 < 85 or systolic_bp < 90:
        return "critical"
    if 85 <= spo2 <= 92:
        return "warning"
    return "stable"


def bounded_gauss(rng: random.Random, mean: float, std_dev: float, lower: float, upper: float) -> float:
    value = rng.gauss(mean, std_dev)
    return max(lower, min(upper, value))


def generate_rows(row_count: int = ROW_COUNT):
    rng = random.Random(RANDOM_SEED)

    for _ in range(row_count):
        heart_rate = round(bounded_gauss(rng, mean=92, std_dev=22, lower=40, upper=180))
        spo2 = round(bounded_gauss(rng, mean=93, std_dev=6, lower=70, upper=100))
        temperature = round(bounded_gauss(rng, mean=37.2, std_dev=1.2, lower=34, upper=41), 1)
        systolic_bp = round(bounded_gauss(rng, mean=118, std_dev=24, lower=70, upper=200))
        diastolic_bp = round(bounded_gauss(rng, mean=76, std_dev=14, lower=40, upper=130))
        risk_label = assign_risk_label(spo2, systolic_bp)

        yield {
            "heart_rate": heart_rate,
            "spo2": spo2,
            "temperature": temperature,
            "systolic_bp": systolic_bp,
            "diastolic_bp": diastolic_bp,
            "risk_label": risk_label,
        }


def main() -> None:
    output_path = Path(__file__).resolve().parent / "icu_dataset.csv"
    rows = list(generate_rows(ROW_COUNT))
    fieldnames = [
        "heart_rate",
        "spo2",
        "temperature",
        "systolic_bp",
        "diastolic_bp",
        "risk_label",
    ]

    with output_path.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Generated {len(rows)} rows")
    print(f"Saved dataset to: {output_path}")


if __name__ == "__main__":
    main()
