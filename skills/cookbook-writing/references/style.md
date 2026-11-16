# Cookbook style guide

> **Purpose:** This guide tells you how to write a cookbook tutorial. Follow it for every new chapter and for
> every change to a chapter.
> **Audience:** Anyone who writes or reviews the cookbook, people and agents.

A cookbook reader is often new to the team. They know the language and the tools of the stack. They do not know the
product, its business, or its vocabulary. A tutorial must teach them all three without fear. The handbook can be
dense, because readers look things up in it. A tutorial must be easy, because readers follow it from start to end.

The cookbook uses ASD-STE100 Simplified Technical English. The friendly tone comes from the structure, the story,
and the examples. It does not come from casual words.

---

## 1. The language rules

### 1.1 ASD-STE100

- Write 20 words or fewer in a procedure sentence. Write 25 words or fewer in a descriptive sentence.
- Use the active voice. Name the actor: "The router checks the permission."
- Use the imperative for an instruction: "Run the test command."
- Put one instruction in each sentence. Put a condition first: "If the test fails, read the message."
- Use simple tenses. For a rule, use "must", "must not", or "can".
- Keep the articles ("a", "an", "the").
- Do not use idioms, slang, or jokes. A reader whose first language is not English must understand each word.

Do not use these words. Use the word on the right. The reading-level script checks this table.

| Do not use | Use |
|---|---|
| should, would, could, might, may | must, can, or a plain statement |
| ensure | make sure |
| utilize, leverage | use |
| perform | do |
| obtain, fetch | get |
| provide | give |
| require | need, must |
| via | through |
| prior to | before |
| expose | give, has, make available |
| e.g., i.e., etc. | for example, that is, a full list |

### 1.2 The reading level of the cookbook

These limits are stricter than ASD-STE100. They keep a tutorial easy for a new reader.

| Item | Limit | Checked by |
|---|---|---|
| Technical terms in one sentence | 2 or fewer | the human reader |
| Sentences in one paragraph | 4 or fewer | the script |
| Lines in one code block | 20 or fewer | the script |
| New terms in one section | 3 or fewer | the human reader |
| Steps in one numbered procedure | 7 or fewer. Split a longer procedure into two sections. | the script |

### 1.3 Say the concrete fact, then its effect

An abstract label makes the reader stop and translate. Say what is true, in plain words, and say why it is
important.

| Do not write | Write |
|---|---|
| "The facade exposes nothing." | "The file `public.py` (or `index.ts`) has only a comment. It has no functions yet, so other modules cannot call the billing module." |
| "The module is a shell." | "The billing module has its folders, but no code yet." |
| "Orders keeps a projection." | "Orders keeps its own copy of the price values. Billing sends the copy in an event." |

---

## 2. Terms: teach the idea, then the name

The reader must learn the vocabulary of the team. Then they can read the handbook and the spec without help. Use this
rule for every term of the codebase or the business.

1. **Introduce a term where the reader first needs it.** Do not put a list of terms at the start of a chapter.
2. **First the plain idea, then the name.** Write the name in bold at its first use, and say where the name
   comes from. Use a "New term" box when the idea needs more than one sentence.

   > Each module has one file that other modules can use. The team calls this file the **facade**. It is the
   > entry file of the module.

3. **After the first use, use the name only.** Do not explain it again in the same tutorial.
4. **One name for one idea.** Never change between "facade", "public API", and "interface". If the documents use
   two names for one idea, say so one time: "The spec also calls the credit wallet the balance account."
5. **Keep the term list.** Each tutorial has a `terms.md` file. Add each new term to it, with its plain meaning,
   the chapter that introduces it, and its entry in the glossary or the handbook.
6. **Link once in each chapter.** The first time that a chapter uses a term from an earlier chapter, link it to
   `terms.md`. After that, write the term without a link.

---

## 3. The story

Each tutorial follows one story from start to end. The story gives the reader a reason for each step, and it
gives each example real values. The first chapter of a tutorial defines the story in a table: who or what, and the
role in the story. Take the real business of the project and invent a small, true case. The README of the tutorial
holds the table.

Example of a story table (invented):

| Who or what | Role in the story |
|---|---|
| **Fern Books** (slug `fern`) | A small online bookshop. It sells books and takes orders through the product. |
| **Olive** | The owner of Fern Books. Olive manages the team and pays the bill. |
| **Sam** | A sales team member at Fern Books. |
| **Basic** plan | Orders and the inbox. 5 seats. No campaigns. |
| **Custom terms** | A special price or a special value for one company. Fern gets 2 extra seats for one month. |

Rules for the story:

- Use the story for each example: names, values, requests, and rows.
- Refer to a person by name or by role. Do not use "he" or "she". Use "they" if you need a pronoun.
- Keep the story true to the spec. The story never adds a rule that the spec does not have.
- Do not use the name of a real customer, a real person, or a real incident.

---

## 4. The structure of a chapter

Use these parts in this order. Leave out a part only when the chapter has nothing for it.

| Part | Content |
|---|---|
| Title | `# NN — <action in plain words>`, for example "07 — Write the tests first" |
| **You are here** | The list of chapters, with the current chapter in bold |
| **What you will do** | 2 or 3 sentences in plain words. No term that the reader does not know yet. |
| **Why it matters** | A short scene from the story that needs this chapter |
| **Before you start** | The earlier chapters and the state that this chapter needs |
| Sections | Numbered `NN.1`, `NN.2`. Each section has steps, then **Check:**, then **Result:** when it gives a result. |
| Boxes | "New term", "Go deeper", and "If it does not work" (section 5) |
| **What you learned** | 3 to 5 short points |
| **Terms in this chapter** | The new terms of the chapter, each linked to `terms.md` |
| **Next** | A link to the next chapter |

Each step links to the handbook section that explains the mechanism. The link goes at the end of the step, as
"More: <link>". The handbook path comes from the project's `## Docs layout` section.

Use this form for **You are here**:

```
You are here: 01 Understand · 02 Modules · 03 Dependencies · **04 Schema** · 05 Spec · 06 Scaffold ·
07 Tests · 08 Code · 09 Gate · 10 Container · 11 Validate · 12 Ship
```

---

## 5. Boxes

Write a box as a block quote with a bold label.

> **New term: entitlement.** An entitlement is one thing that a plan gives. "Campaigns: yes" is an entitlement.
> "Seats: 5" is also an entitlement.

> **Go deeper:** Optional detail for a reader who wants to know why. The main steps never depend on a "Go deeper"
> box. A reader can skip all of them on the first pass.

> **If it does not work:** The symptom, the likely cause, and the fix. Add this box after each step where a new
> reader often gets stuck.

Keep the labels of the handbook for risks: **WARNING:** (data, money, or security), **CAUTION:** (a defect or an
outage), and **NOTE:** (a useful fact). Start a WARNING or a CAUTION with the instruction.

Reassure the reader with facts. Tell them what they can leave for later, and where it is explained:

> You do not need to understand the isolation of tenant data now. Chapter 04 explains it.

---

## 6. Code and commands

- Put one sentence before each code block. Tell the reader what to look at in it.
- Keep a code block to 20 lines or fewer. Show the important part, and write "shortened" in the label.
- Use the real API of the codebase exactly. Read the source before you write a call.
- Mark code that the build has not made yet with the label **Planned code**. Replace it with the real code after
  the build.
- Code blocks must pass the formatter of the project, when the project formats the code blocks in Markdown (read
  the `format` and `lint` keys of `## Commands`).
- Give each command its expected result: "**Check:** The output ends with `3 passed`."
- Write a command by the key of `## Commands` of the project, not as a guess. When a chapter shows a command for a
  reader to type, copy it from that table.

Examples of the same step in two stacks (the real command comes from the project):

| Stack | Run one test file |
|---|---|
| Python | `pytest tests/test_price.py` |
| JavaScript | `vitest run src/price.test.ts` |

---

## 7. The checklist before you finish a chapter

1. The chapter has the parts of section 4 in their order.
2. Each new term has one plain introduction, its bold name, and a row in `terms.md`. No other chapter explains it
   again.
3. Each example uses the story.
4. The reading-level check passes with 0 findings.
5. Each link and each `#anchor` exists.
6. Each diagram source renders (the project renders diagrams by its own command).
7. The lint and format commands of the project pass on the docs folder.
