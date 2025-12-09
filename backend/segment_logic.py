"""
Segment Logic Helper

This module provides functions to evaluate segmentation rules based on survey responses.
It uses the configuration from config.py to determine user segments.
"""

from config import SURVEY_CONFIG
from models import SurveyStatus


def evaluate_segment_conditions(answers, conditions):
    """
    Evaluate if answers match the given conditions.

    Args:
        answers: Dictionary of question_id -> answer_value
        conditions: Dictionary of condition rules from config

    Returns:
        bool: True if all conditions are met
    """
    for question_key, condition in conditions.items():
        answer_value = answers.get(question_key)

        if answer_value is None:
            return False

        operator = condition.get("operator", "equals")
        expected_values = condition.get("values", [])
        exclude_values = condition.get("exclude", [])
        is_list = condition.get("type") == "list"

        # Handle exclude operator (e.g., "not contains")
        if operator == "not_contains":
            if any(exclude in str(answer_value) for exclude in exclude_values):
                return False
            continue

        # Handle list/array fields
        if is_list:
            if not isinstance(answer_value, list):
                answer_value = [answer_value] if answer_value else []

            if operator == "contains":
                # Check if any expected value is in the answer list
                if not any(val in answer_value for val in expected_values):
                    return False
            elif operator == "contains_any":
                # Check if any expected value is in the answer list
                if not any(val in answer_value for val in expected_values):
                    return False
            else:
                # For other operators, check if answer list matches
                if answer_value != expected_values:
                    return False
        else:
            # Handle single value fields
            if operator == "in":
                if answer_value not in expected_values:
                    return False
            elif operator == "equals":
                if answer_value != expected_values[0] if expected_values else None:
                    return False
            else:
                # Default: check if answer matches any expected value
                if answer_value not in expected_values:
                    return False

    return True


def determine_segment(survey_responses):
    """
    Determine user segment based on survey responses using configuration rules.

    Args:
        survey_responses: List of survey response dictionaries with question_title and answer

    Returns:
        tuple: (segment_name, survey_status)
    """
    config = SURVEY_CONFIG

    # Helper to find answer by question key
    def get_answer_value(question_key):
        question_config = config["questions"].get(question_key)
        if not question_config:
            return None

        partial_title = question_config["partial_title"]
        answer_type = question_config["type"]

        for response in survey_responses:
            question_title = response.get('question_title', '').lower()
            if partial_title.lower() in question_title:
                if answer_type == 'choice':
                    answer = response.get('answer', {})
                    if isinstance(answer, dict):
                        return answer.get('label')
                    return answer
                elif answer_type == 'choices':
                    answer = response.get('answer', {})
                    if isinstance(answer, dict):
                        return answer.get('labels', [])
                    return answer if isinstance(answer, list) else [answer]
                else:
                    return response.get('answer')
        return None

    # Extract all answers
    answers = {}
    for question_key in config["questions"].keys():
        answers[question_key] = get_answer_value(question_key)

    # Evaluate rules in order
    for rule in config["segmentation"]["rules"]:
        if evaluate_segment_conditions(answers, rule["conditions"]):
            segment = rule["segment"]
            status_str = rule["status"]

            # Convert status string to SurveyStatus enum
            status_map = {
                "completed": SurveyStatus.COMPLETED,
                "terminated": SurveyStatus.TERMINATED,
                "pending": SurveyStatus.PENDING,
                "in_progress": SurveyStatus.IN_PROGRESS,
                "failed": SurveyStatus.FAILED
            }
            status = status_map.get(status_str, SurveyStatus.TERMINATED)

            return segment, status

    # Default segment if no rules match
    default_segment = config["segmentation"]["default_segment"]
    default_status_str = config["segmentation"]["default_status"]
    status_map = {
        "completed": SurveyStatus.COMPLETED,
        "terminated": SurveyStatus.TERMINATED,
        "pending": SurveyStatus.PENDING,
        "in_progress": SurveyStatus.IN_PROGRESS,
        "failed": SurveyStatus.FAILED
    }
    default_status = status_map.get(default_status_str, SurveyStatus.TERMINATED)

    return default_segment, default_status

