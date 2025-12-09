"""
Survey Configuration Loader

This module loads the survey configuration from the shared JSON file.
The configuration file is located at config/survey.json and is shared
between backend and frontend.
"""

import json
from pathlib import Path

# Get the project root directory (parent of backend directory)
PROJECT_ROOT = Path(__file__).parent.parent
CONFIG_PATH = PROJECT_ROOT / "config" / "survey.json"


def load_config():
    """
    Load survey configuration from JSON file.

    Returns:
        dict: Survey configuration dictionary

    Raises:
        FileNotFoundError: If config file doesn't exist
        json.JSONDecodeError: If config file is invalid JSON
    """
    if not CONFIG_PATH.exists():
        raise FileNotFoundError(
            f"Configuration file not found at {CONFIG_PATH}. "
            "Please ensure config/survey.json exists."
        )

    with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
        config = json.load(f)

    return config


# Load configuration on module import
SURVEY_CONFIG = load_config()
