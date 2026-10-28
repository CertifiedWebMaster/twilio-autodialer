import os
import uuid

from emergentintegrations.llm.chat import LlmChat, StreamDone, TextDelta, UserMessage

MODELS = {"openai": ("openai", "gpt-6-sol"), "gemini": ("gemini", "gemini-4-argon")}
LABELS = {"openai": "ChatGPT (GPT 6 Sol)", "gemini": "Gemini 4 Argon"}

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


def _chat(system: str, provider: str) -> LlmChat:
    return LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=str(uuid.uuid4()),
                   system_message=system).with_model(*MODELS[provider])


async def stream(system: str, text: str, provider: str = "openai"):
    async for ev in _chat(system, provider).stream_message(UserMessage(text=text)):
        if isinstance(ev, TextDelta):
            yield ev.content
        elif isinstance(ev, StreamDone):
            break


def notes_input(notes: str, contact: dict, outcome: str) -> str:
    return f"Contact: {contact.get('name') or 'Unknown'}\nOutcome selected: {outcome or 'none yet'}\nAgent notes:\n{notes}"


OUTCOME_PROMPT = (
    "You classify the result of an outbound sales/outreach phone call from the agent's notes. "
    "Allowed outcomes: interested, not_interested, voicemail, no_answer, busy, wrong_number, callback, do_not_call. "
    "Use do_not_call only if the person explicitly asked not to be called again. Use callback when they asked to be called later. "
    "Reply with ONLY a JSON object, no markdown: "
    '{"outcome": "<one allowed value>", "reason": "<max 12 words>", "callback_at": "<YYYY-MM-DDTHH:MM local time or null>"}. '
    "callback_at is only for callback, resolved against the agent's current local time given; otherwise null."
)


async def complete(system: str, text: str, provider: str = "openai") -> str:
    return "".join([c async for c in stream(system, text, provider)])


def outcome_input(notes: str, contact: dict, call: dict, local_now: str) -> str:
    return (f"Agent's current local time: {local_now}\nContact: {contact.get('name') or 'Unknown'}\n"
            f"Twilio call status: {call.get('status')} (duration {call.get('duration') or 0}s)\nAgent notes:\n{notes}")


def contact_input(contact: dict, history: list) -> str:
    extra = "\n".join(f"{k}: {v}" for k, v in (contact.get("extra") or {}).items())
    past = "\n".join(f"- {h.get('outcome') or h.get('status')}: {h.get('notes') or ''}" for h in history) or "none"
    return f"Name: {contact.get('name') or 'Unknown'}\n{extra}\nList: {contact.get('list_name', '')}\nPrevious calls:\n{past}"
