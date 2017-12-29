const fs = require("fs")

const FAR_PAST = new Date("1000-01-01 00:00:00+00:00")

/** @typedef {function() => Promise<Date>} */
const Rule = function() {}

/**
 * @param {Array<Date>} dates
 * @return {Date}
 */
const maxTime = dates => {
  return dates.reduce(
    (a, b) => a > b ? a : b,
    FAR_PAST
  )
}

/**
 * @param {string} path
 * @return {Promise<Date>}
 */
const getMTime = path => {
  return new Promise((resolve, reject) => {
    fs.stat(path, (err, stats) => {
      if (err) {
        if (err.code == "ENOENT") {
          resolve(FAR_PAST)
          return
        }
        reject()
        return
      }
      resolve(stats.mtime)
    })
  })
}

/**
 * @param {Array<Rule>} rules
 * @return {Promise<Array<Date>>}
 */
const inSequence = async rules => {
  const results = []
  for (let i = 0; i < rules.length; ++i) {
    results.push(await run(rules[i]))
  }
  return results
}

/**
 * @param {Rule|Array<Rule>|Object} rule
 * @return {Promise<Date>}
 */
const run = async rule => {
  if (typeof rule == "function") {
      return rule()
  }
  if (Array.isArray(rule)) {
    return maxTime(await inSequence(rule))
  }
  return run(Object.keys(rule).map(key => rule[key]))
}

/**
 * @param {string} target
 * @param {Array<Rule>} prereqs
 * @param {function(target, prereqs) => Promise} execute
 * @return Rule
 */
const file = (target, prereqs, execute) => {
  const func = async () => {
    const _prereqs = (prereqs || []).map(x => {
      return typeof x == "string" ? (() => getMTime(x)) : x
    })
    const results = await inSequence(_prereqs)
    const prereq_time = maxTime(results)
    const target_time = await getMTime(target)
    if (target_time > prereq_time) {
      return target_time
    }
    console.log(target)
    await execute(target, prereqs)
    return await getMTime(target)
  }
  Object.defineProperty(func, "target", {
    get: () => target
  })
  Object.defineProperty(func, "prereqs", {
    get: () => prereqs.slice(0) // clone
  })
  return func
}

/**
 * @param {function() => Promise} action
 * @return {Rule}
 */
const always = (action) => {
  return async () => {
    await action()
    return FAR_PAST
  }
}

/**
 * @param {string} path
 * @return {Array<string>}
 */
const listFiles = path => {
  if (!fs.statSync(path).isDirectory()) {
    return [path]
  }
  return fs.readdirSync(path).reduce((items, item) => {
    return items.concat(listFiles(path + "/" + item))
  }, [])
}

/**
 * @param {Rule} rule
 * @param {number} interval
 * @param {number} interval_on_error
 * @return null
 */
const forever = (rule, interval = 200, interval_on_error = 5000) => {
  const loop = async () => {
    run(rule)
    .then(() => {
      setTimeout(loop, interval)
    })
    .catch(e => {
      console.error(e)
      setTimeout(loop, interval_on_error)
    })
  }
  loop()
}

module.exports = {
  run,
  file,
  always,
  forever,
  listFiles,
  FAR_PAST,
}
