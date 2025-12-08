from pydantic import BaseModel
from typing import List, Dict, Optional, Any

class Hidden(BaseModel):
    """Represents the hidden section of the TypeForm webhook payload."""
    user_id: Optional[str] = None


class Field(BaseModel):
    """Represents a form field/question definition."""
    id: str
    title: Optional[str] = None
    type: Optional[str] = None
    ref: Optional[str] = None


class Definition(BaseModel):
    """Represents the form definition section containing field mappings."""
    fields: List[Field]

    def get_field_by_id(self, field_id: str) -> Optional[Field]:
        """Get a field definition by its ID."""
        for field in self.fields:
            if field.id == field_id:
                return field
        return None

    def get_field_mapping(self) -> Dict[str, str]:
        """Get a mapping of field IDs to field titles."""
        return {field.id: field.title for field in self.fields}


class Answer(BaseModel):
    """Represents a single answer in the form response."""
    field: Field
    type: str
    choice: Optional[Dict[str, Any]] = None
    choices: Optional[Dict[str, Any]] = None

    def get_answer_value(self) -> Any:
        """Extract the answer value based on the answer type."""
        if self.choice is not None:
            return self.choice
        if self.choices is not None:
            return self.choices
        return None


class FormResponse(BaseModel):
    """Represents the form response section of the TypeForm webhook."""
    hidden: Hidden
    definition: Definition
    answers: List[Answer]
    form_id: Optional[str] = None
    token: Optional[str] = None
    submitted_at: Optional[str] = None

    def get_answers_with_questions(self) -> List[Dict[str, Any]]:
        """Get answers mapped to their question titles."""
        field_mapping = self.definition.get_field_mapping()
        result = []

        for answer in self.answers:
            question_id = answer.field.id
            question_title = field_mapping.get(question_id, "Unknown Question")
            answer_value = answer.get_answer_value()

            result.append({
                "question_id": question_id,
                "question_title": question_title,
                "answer": answer_value,
                "answer_type": answer.type
            })

        return result


class TypeformWebhookPayload(BaseModel):
    """Top-level model representing the complete TypeForm webhook payload."""
    event_id: str
    event_type: str
    form_response: FormResponse

    def get_user_id(self) -> Optional[str]:
        """Extract user_id from the hidden section."""
        return self.form_response.hidden.user_id

    def get_definitions(self) -> Definition:
        """Get the definitions section for mapping answers to questions."""
        return self.form_response.definition

    def get_answers(self) -> List[Answer]:
        """Get the answers section."""
        return self.form_response.answers

