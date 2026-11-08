-- Unit tests of the Lua state module, driven by tests/state-cases.json.
-- Run with: quarto pandoc lua tests/unit/state-test.lua

local script = PANDOC_SCRIPT_FILE or arg[0]
local script_dir = script:match('^(.*)/[^/]*$') or '.'
local cases_path = script_dir .. '/../state-cases.json'
local module_path = script_dir .. '/../../_extensions/veil/veil-state.lua'

local function read_file(path)
  local handle = assert(io.open(path, 'r'))
  local content = handle:read('a')
  handle:close()
  return content
end

local State = dofile(module_path)
local cases = pandoc.json.decode(read_file(cases_path), false)

local function same_list(a, b)
  if #a ~= #b then
    return false
  end
  for i = 1, #a do
    if a[i] ~= b[i] then
      return false
    end
  end
  return true
end

local function run_case(case)
  local failures = {}
  local function fail(message)
    failures[#failures + 1] = message
  end

  local resolved, warnings = State.initial(case.groups)
  if State.format(resolved) ~= case.initial.text then
    fail(string.format('initial: expected "%s", got "%s"', case.initial.text, State.format(resolved)))
  end
  if #warnings ~= case.initial.warnings then
    fail(string.format('initial: expected %d warnings, got %d', case.initial.warnings, #warnings))
  end

  for _, item in ipairs(case.apply) do
    local result, unknown = State.apply(resolved, item.input)
    local text = State.format(result)
    if text ~= item.text then
      fail(string.format('apply("%s"): expected "%s", got "%s"', item.input, item.text, text))
    end
    if not same_list(unknown, item.unknown) then
      fail(string.format('apply("%s"): unknown tokens differ (got %d, expected %d)', item.input, #unknown, #item.unknown))
    end
  end

  for _, item in ipairs(case.visible) do
    local got = State.visible(resolved, item.names)
    if got ~= item.expected then
      fail(string.format('visible({%s}): expected %s, got %s', table.concat(item.names, ','), tostring(item.expected), tostring(got)))
    end
  end

  for _, item in ipairs(case.previous or {}) do
    local got = State.previous_level(resolved, item.level)
    if got ~= item.expected then
      fail(string.format('previous_level(%d): expected %d, got %d', item.level, item.expected, got))
    end
  end

  for _, item in ipairs(case.step) do
    local start = State.apply(resolved, item.from)
    local text = State.format(State.step(start, item.direction))
    if text ~= item.text then
      fail(string.format('step(%s, %d): expected "%s", got "%s"', item.from, item.direction, item.text, text))
    end
  end

  return failures
end

io.stdout:write('TAP version 13\n')
io.stdout:write(string.format('1..%d\n', #cases))
local failed = 0
for index, case in ipairs(cases) do
  local ok, result = pcall(run_case, case)
  local failures = ok and result or { tostring(result) }
  if #failures == 0 then
    io.stdout:write(string.format('ok %d - %s\n', index, case.name))
  else
    failed = failed + 1
    io.stdout:write(string.format('not ok %d - %s\n', index, case.name))
    for _, message in ipairs(failures) do
      io.stdout:write('  # ' .. message .. '\n')
    end
  end
end
os.exit(failed == 0 and 0 or 1)
