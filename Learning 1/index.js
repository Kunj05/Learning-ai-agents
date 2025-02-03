import  OpenAI from  "openai";
import { ilike } from 'drizzle-orm';
import {db} from './db/index.js';
import { todosTable } from './db/schema.js';
import readlineSync from 'readline-sync';

async function getAllTodos(){
  const todos = await db.select().from(todosTable);
  return todos;
}

async function createTodo(todo) {
  const [result]=await db.insert(todosTable).values({ todo }).returning({id:todosTable.id});
  return result.id;
}
async function searchTodo(search){
  const todos = await db.select().from(todosTable).where(ilike(todosTable.todo, search));
  return todos;
}
async function deletebyId(id) {
  await db.delete(todosTable).where(eq(todosTable.id,id));
}
const tools={
  getAllTodos:getAllTodos,
  createTodo:createTodo,
  searchTodo:searchTodo,
  deletebyId:deletebyId,
}
const SYSTEM_PROMPT = `
You are an AI Todo List Assistant with START, PLAN, ACTION, OBSERVATION, and OUTPUT states.
Wait for the user prompt and then follow these steps:

1. **PLAN**: Determine the most suitable action to take using the available tools.
2. **ACTION**: Execute the action using one of the available tools (like adding a task, searching tasks, etc.).
3. **OBSERVATION**: After performing the action, observe the results and update the assistant's response.
4. **OUTPUT**: Return the AI response in the specified JSON output format.

### Todo DB Schema:
- **id**: Integer (Primary Key)
- **todo**: String (Task description, typically 3-4 words, or more if needed)
- **createdAt**: DateTime
- **updatedAt**: DateTime

Available Tools:
- **getAllTodos()**: Returns all todos from the database.
- **createTodo(todo: string)**: Creates a new todo in the database. The todo string input should represent the task (e.g., "record a video for youtube"). The task description can be longer, but ideally not too long (around 3-4 words).
- **searchTodo(query: string)**: Search for all todos matching the query string using the ilike operator.
- **deletebyId(id: string)**: Deletes a todo from the database by its id.

Example Interaction Flow:

1. **User Input**: {"type":"user", "user":"Add a task to record a video for youtube"}
2. **Plan**: {"type":"plan", "plan":"I will clarify the task the user wants to add."}
3. **Output**: {"type":"output", "output":"Can you tell me more about the video you want to record?"}
4. **User Input**: {"type":"user", "user":"I want to record a video for youtube"}
5. **Plan**: {"type":"plan", "plan":"I will use createTodo() to add the task to the database."}
6. **Action**: {"type":"action", "function":"createTodo", "input":"record a video for youtube"}
7. **Observation**: {"type":"observation", "observation":"2"}
8. **Success**: {"type":"success", "success":"Task added successfully with id 2"}

Important Notes:
- When adding tasks using **createTodo()**, the **todo** field should store a clear description of the task (e.g., "record a video for youtube"). If the input string is too long, ensure it is truncated correctly at an appropriate length in your system.
- If you're not seeing the correct todo text (e.g., only the letter "r" being stored), ensure that the input string passed to the **createTodo()** function is captured in full. This may involve debugging how the input is being processed or passed from the system.

User Input Example:
User might type: "I want to record a video for youtube" 

The **createTodo()** function should then receive: "record a video for youtube"

Ensure no truncation or unintended substring behavior is occurring while passing inputs.

If you still encounter issues, double-check that:
1. The correct string is being passed from the action.
2. The string is not being truncated or split unexpectedly.
3. The **todo** field in your database schema is able to store strings of sufficient length.

Example JSON format for adding a task:
{
  "type": "action",
  "function": "createTodo",
  "input": "record a video for youtube"
}

Sample Todo Entry:
id:5
todo:record a video for youtube
createdAt:2022-10-10
updatedAt:2022-10-10

Strictly Follow ths sample Todo Entry format for all types of interactions.

### Format for JSON Output:
Always strictly follow this format for all types of interactions (e.g., action, plan, output, observation, success).

{"type":"success", "success":"Task added successfully with id X"}
`;

const messages = [
  {
    role: "system",
    content: SYSTEM_PROMPT,
  },
];

const token = "";
const endpoint = "";
const modelName = "gpt-4o-mini";

const client = new OpenAI({ baseURL: endpoint, apiKey: token });

while(true){
  const query = readlineSync.question(">>>>>> ");
  const userMessage = {
    role: "user",
    content: query,
  };
  messages.push({role: "user", content: JSON.stringify(userMessage)});
  while(true){
    const response = await client.chat.completions.create({
      messages: messages,
      temperature: 0.5,
      top_p: 1.0,
      max_tokens: 300,
      model: modelName,
      response_format: {type:'json_object'}
    });
    const result=response.choices[0].message.content;
    messages.push({role: "assistant", content: result});    
    
    const action = JSON.parse(result);
    if(action.type==="output"){
      console.log(`🎂:${action.output}`);
      break;
    }else if(action.type==='action'){
      const fn=tools[action.function];
      if(!fn)throw new Error("Function not found");
      const observation= await fn(...action.input);
      const observationMessage={
        role: "observation",
        content: JSON.stringify({type:"developer",content:JSON.stringify(observation)})
      }
    }
  }
}