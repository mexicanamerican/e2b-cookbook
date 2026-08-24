import fs from 'node:fs'
import OpenAI from 'openai'
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions'
import { Sandbox, Result } from '@e2b/code-interpreter'
import type { Execution } from '@e2b/code-interpreter'
import { OutputMessage } from '@e2b/code-interpreter'
import * as dotenv from 'dotenv'

dotenv.config()

// The model writes the Python, so it will sometimes write Python that does not
// parse or that throws. Hand the traceback back and let it fix its own cell,
// the way a person would - one bad cell should not end the run.
const MAX_TURNS = 4

const MODEL_NAME = 'gpt-5.6-terra' // Choose a different model by uncommenting. It needs function-calling support on
// /v1/chat/completions - gpt-5.6-terra and gpt-5.6-luna do, gpt-5.6-sol does not.
// const MODEL_NAME = 'gpt-5.6-terra'

const SYSTEM_PROMPT = `
## your job & context
you are a python data scientist. you are given tasks to complete and you run python code to solve them.

Information about the temperature dataset:
- It's in the \`/home/user/city_temperature.csv\` file
- The CSV file is using \`,\` as the delimiter
- It has following columns (examples included):
  - \`Region\`: "North America", "Europe"
  - \`Country\`: "Iceland"
  - \`State\`: for example "Texas" but can also be null
  - \`City\`: "Prague"
  - \`Month\`: "June"
  - \`Day\`: 1-31
  - \`Year\`: 2002
  - \`AvgTemperature\`: temperature in Celsius, for example 24

- the python code runs in jupyter notebook.
- every time you call \`execute_python\` tool, the python code is executed in a separate cell. it's okay to multiple calls to \`execute_python\`.
- display visualizations using matplotlib or any other visualization library directly in the notebook. don't worry about saving the visualizations to a file.
- you have access to the internet and can make api requests.
- you also have access to the filesystem and can read/write files.
- you can install any pip package (if it exists) if you need to but the usual packages for data analysis are already preinstalled.
- you can run any python code you want, everything is running in a secure sandbox environment.
`

const tools: ChatCompletionTool[] = [
    {
        type: 'function',
        function: {
            name: 'execute_python',
            description: 'Execute python code in a Jupyter notebook cell and returns any result, stdout, stderr, display_data, and error.',
            parameters: {
                type: 'object',
                properties: {
                    code: {
                        type: 'string',
                        description: 'The python code to execute in a single cell.'
                    }
                },
                required: ['code']
            }
        }
    }
]

// Returns the whole execution, errors included, so the caller can decide
// whether to give up or hand the traceback back to the model.
async function codeInterpret(codeInterpreter: Sandbox, code: string): Promise<Execution> {
    console.log('Running code interpreter...')

    return await codeInterpreter.runCode(code, {
        onStderr: (msg: OutputMessage) => console.log('[Code Interpreter stderr]', msg),
        onStdout: (stdout: OutputMessage) => console.log('[Code Interpreter stdout]', stdout),
    })
}

const client = new OpenAI()

async function processToolCall(codeInterpreter: Sandbox, toolCall: any): Promise<Execution | null> {
    if (toolCall.function.name === 'execute_python') {
        const toolInput = JSON.parse(toolCall.function.arguments)
        return await codeInterpret(codeInterpreter, toolInput.code)
    }
    return null
}

async function chatWithLLM(codeInterpreter: Sandbox, userMessage: string): Promise<Result[]> {
    console.log(`\n${'='.repeat(50)}\nUser Message: ${userMessage}\n${'='.repeat(50)}`)

    const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage }
    ]

    for (let turn = 1; turn <= MAX_TURNS; turn++) {
        console.log(`\nWaiting for the LLM to respond (turn ${turn}/${MAX_TURNS})...`)
        const completion = await client.chat.completions.create({
            model: MODEL_NAME,
            messages,
            // gpt-5.6-* are reasoning models; function tools on chat.completions
            // require reasoning_effort 'none' (or the /v1/responses API).
            reasoning_effort: 'none',
            tools: tools,
            tool_choice: 'auto'
        })

        const message = completion.choices[0].message
        console.log('\nResponse:', message)
        messages.push(message)

        // Deliberately a failure: with no tool call there was no code to run, so the
        // example demonstrated nothing. A missing *chart* is fine; missing code is not.
        if (!message.tool_calls?.length) {
            throw new Error('The model returned no tool call, so there was no code to execute.')
        }

        const toolCall = message.tool_calls[0]
        // v7 widened tool_calls to a union of function and custom tool calls.
        if (toolCall.type !== 'function') throw new Error('Expected a function tool call.')
        console.log(`\nTool Used: ${toolCall.function.name}\nTool Input: ${toolCall.function.arguments}`)

        const execution = await processToolCall(codeInterpreter, toolCall)
        if (!execution) throw new Error(`The model called an unknown tool: ${toolCall.function.name}`)

        if (execution.error) {
            console.log('[Code Interpreter ERROR]', execution.error)
            messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: `The cell failed.\n${execution.error.name}: ${execution.error.value}\n\n${execution.error.traceback}\n\nFix the code and call execute_python again.`
            })
            continue
        }

        console.log(`Tool Result: ${execution.results}`)
        return execution.results
    }

    throw new Error(`The model did not produce runnable code within ${MAX_TURNS} turns.`)
}

async function uploadDataset(codeInterpreter: Sandbox): Promise<string> {
    console.log('Uploading dataset to Code Interpreter sandbox...')
    const datasetPath = './city_temperature.csv'

    if (!fs.existsSync(datasetPath)) {
        throw new Error('Dataset file not found')
    }

    const fileContent = fs.readFileSync(datasetPath, 'utf-8')

    try {
        const { path: remotePath } = await codeInterpreter.files.write('city_temperature.csv', fileContent)
        if (!remotePath) {
            throw new Error('Failed to upload dataset')
        }
        console.log('Uploaded at', remotePath)
        return remotePath
    } catch (error) {
        console.error('Error during file upload:', error)
        throw error
    }
}

async function run() {
    const codeInterpreter = await Sandbox.create()

    try {
        // First upload the dataset
        const remotePath = await uploadDataset(codeInterpreter)
        console.log('Remote path of the uploaded dataset:', remotePath)

        // Then execute your analysis
        const codeInterpreterResults = await chatWithLLM(
            codeInterpreter,
            'Analyze the temperature data for the top 5 hottest cities globally. Create a visualization showing their average temperatures over the years.'
        )
        const result = codeInterpreterResults[0]
        console.log('Result:', result)
        // The model does not always emit a chart, so there may be no result at all.
        if (!result) {
            console.log('No results returned from the code interpreter.')
            return
        }
        if (result.png) {
            fs.writeFileSync('temperature_analysis.png', Buffer.from(result.png, 'base64'))
        }
    } catch (error) {
        console.error('An error occurred:', error)
        throw error;
    } finally {
        await codeInterpreter.kill()
    }
}

run()