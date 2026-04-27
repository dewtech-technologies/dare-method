#!/usr/bin/env python3
"""
Script de Análise de Telemetria DARE
Analisa o arquivo DARE/TELEMETRY.md e gera insights sobre custos e tokens
"""

import re
import sys
from pathlib import Path
from typing import Dict, List, Tuple

# Preços dos modelos (em USD por 1M tokens)
MODEL_PRICES = {
    "claude-opus-4-1": {"input": 15, "output": 45},
    "claude-sonnet-4-1": {"input": 3, "output": 15},
    "claude-haiku-4-1": {"input": 0.80, "output": 4},
}


def parse_telemetry_file(filepath: Path) -> Dict:
    """Lê e parseia o arquivo DARE/TELEMETRY.md"""
    if not filepath.exists():
        print(f"❌ Erro: Arquivo {filepath} não encontrado")
        sys.exit(1)

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    # Extrair dados usando regex
    data = {
        "design": extract_stage_data(content, "Design"),
        "blueprint": extract_stage_data(content, "Blueprint"),
        "tasks": extract_stage_data(content, "Tasks"),
        "execute": extract_execute_tasks(content),
    }

    return data


def extract_stage_data(content: str, stage_name: str) -> Dict:
    """Extrai dados de uma etapa específica"""
    pattern = rf"### \d+\. {stage_name}.*?\n(.*?)(?=###|\Z)"
    match = re.search(pattern, content, re.DOTALL)

    if not match:
        return {}

    stage_content = match.group(1)

    return {
        "model": extract_value(stage_content, "Modelo Utilizado"),
        "input_tokens": extract_number(stage_content, "Tokens Input"),
        "output_tokens": extract_number(stage_content, "Tokens Output"),
        "total_tokens": extract_number(stage_content, "Tokens Totais"),
        "cost": extract_number(stage_content, "Custo Estimado"),
        "time": extract_value(stage_content, "Tempo de Execução"),
        "status": extract_value(stage_content, "Status"),
    }


def extract_execute_tasks(content: str) -> List[Dict]:
    """Extrai dados de todas as tasks executadas"""
    pattern = r"#### Task \d+: (.*?)\n(.*?)(?=####|\Z)"
    matches = re.finditer(pattern, content, re.DOTALL)

    tasks = []
    for match in matches:
        task_name = match.group(1).strip()
        task_content = match.group(2)

        tasks.append({
            "name": task_name,
            "model": extract_value(task_content, "Modelo Utilizado"),
            "input_tokens": extract_number(task_content, "Tokens Input"),
            "output_tokens": extract_number(task_content, "Tokens Output"),
            "total_tokens": extract_number(task_content, "Tokens Totais"),
            "cost": extract_number(task_content, "Custo Estimado"),
            "time": extract_value(task_content, "Tempo de Execução"),
            "attempts": extract_number(task_content, "Tentativas"),
            "status": extract_value(task_content, "Status"),
        })

    return tasks


def extract_value(text: str, key: str) -> str:
    """Extrai um valor string de uma tabela Markdown"""
    pattern = rf"\| {key} \| (.*?) \|"
    match = re.search(pattern, text)
    return match.group(1).strip() if match else "N/A"


def extract_number(text: str, key: str) -> float:
    """Extrai um número de uma tabela Markdown"""
    value = extract_value(text, key)
    # Remove símbolos como $, %, vírgulas
    value = re.sub(r"[$%,]", "", value)
    try:
        return float(value)
    except ValueError:
        return 0.0


def calculate_cost(input_tokens: float, output_tokens: float, model: str) -> float:
    """Calcula o custo estimado em USD"""
    if model not in MODEL_PRICES:
        return 0.0

    prices = MODEL_PRICES[model]
    input_cost = (input_tokens / 1_000_000) * prices["input"]
    output_cost = (output_tokens / 1_000_000) * prices["output"]

    return input_cost + output_cost


def print_summary(data: Dict):
    """Imprime um resumo dos dados"""
    print("\n" + "=" * 60)
    print("📊 ANÁLISE DE TELEMETRIA - DARE")
    print("=" * 60 + "\n")

    # Totais
    total_tokens = 0
    total_cost = 0.0
    model_usage = {}

    for stage_name, stage_data in data.items():
        if stage_name == "execute":
            for task in stage_data:
                total_tokens += task.get("total_tokens", 0)
                cost = calculate_cost(
                    task.get("input_tokens", 0),
                    task.get("output_tokens", 0),
                    task.get("model", ""),
                )
                total_cost += cost
                model = task.get("model", "unknown")
                model_usage[model] = model_usage.get(model, 0) + task.get("total_tokens", 0)
        else:
            if stage_data:
                total_tokens += stage_data.get("total_tokens", 0)
                cost = calculate_cost(
                    stage_data.get("input_tokens", 0),
                    stage_data.get("output_tokens", 0),
                    stage_data.get("model", ""),
                )
                total_cost += cost
                model = stage_data.get("model", "unknown")
                model_usage[model] = model_usage.get(model, 0) + stage_data.get("total_tokens", 0)

    print(f"💰 Custo Total Estimado: ${total_cost:.2f}")
    print(f"📈 Tokens Totais: {total_tokens:,}")
    print(f"🤖 Modelos Utilizados: {len(model_usage)}")
    print()

    # Por etapa
    print("Detalhamento por Etapa:")
    print("-" * 60)

    for stage_name, stage_data in data.items():
        if stage_name == "execute":
            print(f"\n🚀 Execute Tasks ({len(stage_data)} tasks):")
            for i, task in enumerate(stage_data, 1):
                cost = calculate_cost(
                    task.get("input_tokens", 0),
                    task.get("output_tokens", 0),
                    task.get("model", ""),
                )
                status = "✓" if "Sucesso" in task.get("status", "") else "✗"
                print(f"  {status} Task {i}: {task.get('name', 'N/A')}")
                print(f"     Tokens: {task.get('total_tokens', 0):,} | Custo: ${cost:.2f}")
        else:
            if stage_data:
                cost = calculate_cost(
                    stage_data.get("input_tokens", 0),
                    stage_data.get("output_tokens", 0),
                    stage_data.get("model", ""),
                )
                status = "✓" if "Sucesso" in stage_data.get("status", "") else "✗"
                print(f"\n{status} {stage_name.upper()}:")
                print(f"   Tokens: {stage_data.get('total_tokens', 0):,}")
                print(f"   Custo: ${cost:.2f}")
                print(f"   Tempo: {stage_data.get('time', 'N/A')}")

    # Modelos
    print("\n" + "-" * 60)
    print("\n🤖 Uso de Modelos:")
    for model, tokens in sorted(model_usage.items(), key=lambda x: x[1], reverse=True):
        percentage = (tokens / total_tokens * 100) if total_tokens > 0 else 0
        print(f"  {model}: {tokens:,} tokens ({percentage:.1f}%)")

    print("\n" + "=" * 60 + "\n")


def main():
    """Função principal"""
    # Procurar por DARE/TELEMETRY.md
    telemetry_file = Path("DARE/TELEMETRY.md")

    if not telemetry_file.exists():
        print("❌ Erro: Arquivo DARE/TELEMETRY.md não encontrado")
        print("Execute /telemetry-report no Cursor para criar o arquivo")
        sys.exit(1)

    print("📖 Lendo arquivo de telemetria...")
    data = parse_telemetry_file(telemetry_file)

    print_summary(data)

    print("💡 Dicas de Otimização:")
    print("  1. Use claude-sonnet-4-1 para tarefas simples (economiza ~80%)")
    print("  2. Agrupe tasks relacionadas na mesma sessão (reutiliza contexto)")
    print("  3. Revise o Blueprint antes de gerar tasks")
    print("  4. Mantenha prompts concisos e diretos\n")


if __name__ == "__main__":
    main()
