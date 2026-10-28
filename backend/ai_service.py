import os
import uuid

from emergentintegrations.llm.chat import LlmChat, StreamDone, TextDelta, UserMessage

MODEL = ("openai", "gpt-6-sol")

NOTES_PROMPT = (
    "You clean up a call-center agent's rough notes from a sales/outreach phone call. "
    "Reply in plain text with exactly two parts:\nSummary: one to three short sentences of what happened.\n"
    "Next step: one short concrete action. Never invent facts that aren't in the notes."
)
POINTS_PROMPT = (
    "You prepare an outbound caller in seconds. Using only the contact details given, write:\n"
    "Opener: one friendly sentence to open the call.\nTalking points: three short bullet lines starting with '- '.\n"
    "Keep it under 90 words, plain text, no markdown headings. Never invent facts about the person."
)


def _chat(system: str) -> LlmChat:
    return LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=str(uuid.uuid4()),
                   system_message=system).with_model(*MODEL)


async def stream(system: str, text: str):
    async for ev in _chat(system).stream_message(UserMessage(text=text)):
        if isinstance(ev, TextDelta):
            yield ev.content
        elif isinstance(ev, StreamDone):
            break


def notes_input(notes: str, contact: dict, outcome: str) -> str:
    return f"Contact: {contact.get('name') or 'Unknown'}\nOutcome selected: {outcome or 'none yet'}\nAgent notes:\n{notes}"


def contact_input(contact: dict, history: list) -> str:
    extra = "\n".join(f"{k}: {v}" for k, v in (contact.get("extra") or {}).items())
    past = "\n".join(f"- {h.get('outcome') or h.get('status')}: {h.get('notes') or ''}" for h in history) or "none"
    return f"Name: {contact.get('name') or 'Unknown'}\n{extra}\nList: {contact.get('list_name', '')}\nPrevious calls:\n{past}"
