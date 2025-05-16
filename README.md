# Hackathon

### Contents

1. **[START HERE](#Known-issues)**
   - **[Story board / User Journey](#User-Journey)**
     <br> [Entry flow](#Entry-flow) | [Main loop](#Main-loop) | [Exit flow](#Exit-flow)
   - **[Implementation plan](#Implementation-plan)**
     <br>[MVP v0](#MVP-v0) | [MVP v1](#MVP-v1) | [Automations](#Automations) | [Stretch](#Stretch)
   - **[Notes/Thoughts](#Notes)**
     <br>[Tech gotchas and rant](#Tech-gotchas-and-rant) | [Product thoughts](#Product-thoughts)
   - **[Medical Appointment Script](#Medical-Appointment-Script)**

# Known issues

1. State management is unstable: resetting a session or re-summarizing are can cause race.
2. Prompts are very basic: Transcriptions occasionally have hallucinations & Summaries are very basic<br>
   Some more details about known [issues here](#tech-gotchas-and-rant).

# User Journey

## Entry flow

1. The app runs on an iPad at the reception
2. A patient walks in
3. Clinician hits start (stretch: app goes to transcribe mode upon detection of presence)
4. The app enters transcribing mode

## Main loop

4. The patient and the clinician are taking turns talking
5. The patient or the Clinician may ask the translator app to repeat the last phrase.
6. The TTS feature for either side of the translation can be turned on/off independently.

## Exit flow

6. The clinician taps the (Summarize) button.
7. The agent determines if actions need to be performed and triggers "tools"
8. Summary is displayed + conversation is stored
9. The clinician taps the "Restart" button to return to the Welcome page (known bug, may need to tap twice)

The UI is designed so that it is also usable on a phone.

# Implementation plan

_Core transcriber functionality. Any of the agentic architecture (translation, summarization, intent classification) relies on this being present and reliable. (optional) It would be nice to add some troubleshooting UI capabilities._

- [ ] Get voice-to-text via OpenAI realtime api \+ websockets working  
       - [ ] Basic state management  
       - [ ] Store message history (db)
- [ ] Basic UI (use tailwind or radix-ui…)  
       - [ ] Conversation Component  
       - [ ] Translated Conversation Component \- which can be the same

### MVP v0 STT

_Bare-bones MVP with basic transcription & translation support. text-based initially._  
_Note: detecting the language switch in a conversation could be used as a rudimentary way to delineate "messages" in the conversation thread, instead of relying on timeouts or diarization._

- [ ] Basic translation feature \- text only  
       - [ ] Add Spanish translation when source is English  
       - [ ] Add English translation when source is Spanish

### MVP v1 TTS

_This is the first completed core use-case. A clinician and a patient can have a dialog and the patient can "automatically" hear what the clinician says in Spanish. The assumption is that the clinician can still use the screen to read the spanish <> english translation and having one-way TTS reduces the complexity._

- [ ] (\*) Text-to-voice for translated text  
       - [ ] _\[stretch\] Consider interrupting TTS if there is audio input, but then repeat if the patient asks to repeat or mention misunderstanding in any form._
- [ ] _Detect "please repeat" intent and implement repeat "tool"._  
       - [ ] _\[stretch\] allow the user to ask to repeat a previous message (or just also let them tap a previous message to repeat)._

### Automations

\_Features related to classification, labelling and triggering workflows (actions). For v1 these should be triggered upon manual termination of the session (the clinician clicks the button to end the session).

- [ ] Conversation summary  
       - [ ] LLM prompt  
       - [ ] Register tool  
       - [ ] UI component  
       - [ ] Persist (db) per conversation
- [ ] Detect/Classify actions  
       - [ ] LLM prompt  
       - [ ] Register tool  
       - [ ] UI (inline message)  
       - [ ] Persist (db) per conversation
- [ ] Trigger action "agents" (setup webhooks)

### Stretch

- [ ] Make the transcribing more accurate and faster
- [ ] Auto-detect end of session based on dialogue  
       _To trigger actions (webhooks) & persist summary_  
       - [ ] Alternatively just rely on the button.
- [ ] Detect participants (diarization)
- [ ] Start agent on voice activity _OR_ on motion detection
- [ ] Start user journey with a TTS greeting asking for their name
- [ ] Improve styling
- [ ] WhisperTranscription must be refactored

# Notes

Tools I used at various points:
Uizard, Lovable, Cursor, VS Code/copilot, elevenLabs, Replit, Claude

## Tech gotchas and rant

- There are no tests
- I experimented with Voice2Voice models but hallucination and inconsistent structure in generation was common. They are great for conversational agents but not ideal for this use case.
- I did minimal prompt engineering. Even the transcriber hallucinates fairly easily so there's work that needs to be done.
- I opted for having a feature-complete solution that serves the given problem vs optimizing and refactoring the code.
- A LOT of the code was written by LLMs and CLEARLY needs refactoring e.g. way too much reliance on `useEvent`, long files, leftover code, mixed component styling, unoptimized react, unnecessary re-renders, no useMemos, cruft...)
- The state logic is convoluted and unnecessarily complicated. Technically the same point as the previous but it has a special place in my heart. I made the mistake of incorporating redux late in the process.
- The STT LLM can get very glitchy with short phrases / utterances, I believe there are some parameters that can be tuned.
- The prompts have a lot of room for improvement. Evals and a framework for eval monitoring/optimization is a must. Having transcripts of actual dialogues would help immensely with fine tuning. I played a little bit with using LLMs to generate fake dialogues.
- There are no tests

## Product thoughts

- The transcribe -> translate -> TTS flow is SLOW. Although models get faster, I'd lobe to experiment with optimization ideas such as using agent-to-agent architectures, fine-tuning of the existing flow (e.g. play around with audio chunking), try different models, have another go with voice-to-voice, use websockets for the server side calls to shave few milliseconds, investigate different LLM orchestration...
- Styling/Layout is MVP-level with few bells and whistles, focusing mostly on the problems at hand. There is a lack of whitespace and the flow is semi-intuitive.
- It would be nice if the EN/EL messages were aligned and scroll together.
- There should (obviously) be more intelligence and structure in passing details about the lab tests and/or the appointments, including e.g. a function to calculate date from the phrase (e.g. 2 weeks from now)

## Medical Appointment Script

(via Claude)

Carlos: Buenos días, doctora. He venido porque tengo un dolor fuerte en el estómago desde hace dos semanas.

Dr. Johnson: I understand. Can you point to where exactly the pain is located and tell me if there are any other symptoms you're experiencing?

Carlos: ¿Puede repetir la última parte?

Carlos: Ah, sí. El dolor está aquí en la parte superior. También tengo náuseas por la mañana y me siento hinchado después de comer.

Dr. Johnson: I'd like to run some blood tests to rule out possible causes. We can schedule a follow-up appointment for next week to review the results.

Carlos: Está bien, gracias. ¿Cuándo debo venir para los análisis?

Dr. Johnson: You can do the blood work tomorrow morning. Come back next Wednesday at 2pm for your follow-up appointment.
