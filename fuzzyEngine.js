/**
 * ISP568: Fuzzy Logic Systems
 * HOW COOKED ARE YOU? v2 — Student Survival Simulator
 * Core Mamdani Fuzzy Inference Engine (Class-based, matches HTML API)
 */

class FuzzyEngine {
    constructor() {
        // INPUT VARIABLE DEFINITIONS
        this.inputDefs = {
            assignmentLoad: {
                min: 0, max: 100,
                sets: {
                    Light:      [0, 0, 20, 55],
                    Packed:     [25, 45, 55, 75],
                    Overloaded: [50, 80, 100, 100]
                }
            },
            sleepHours: {
                min: 0, max: 12,
                sets: {
                    Zombie:      [0, 0, 2, 6],
                    Functioning: [4, 6, 7, 10],
                    WellRested:  [7, 10, 12, 12]
                }
            },
            walletBalance: {
                min: 0, max: 100,
                sets: {
                    Broke:     [0, 0, 15, 45],
                    Surviving: [20, 40, 60, 80],
                    Stable:    [60, 85, 100, 100]
                }
            },
            stressLevel: {
                min: 0, max: 100,
                sets: {
                    Chilling:  [0, 0, 25, 55],
                    Concerned: [30, 50, 60, 80],
                    Screaming: [55, 80, 100, 100]
                }
            }
        };

        // OUTPUT VARIABLE DEFINITION (Survival Score)
        this.outputDef = {
            min: 0, max: 100,
            sets: {
                AcademicVictim:  [0,  0,  10, 25],
                DeepFried:       [20, 35, 45, 55],
                Cooked:          [45, 55, 65, 75],
                HangingInThere:  [65, 75, 85, 90],
                Thriving:        [85, 90, 100, 100]
            }
        };

        // Pre-generate all 81 rules (4 inputs × 3 sets each = 81)
        this.rules = this._generateRules();
    }

    // ─── Trapezoidal Membership Function ───
    trapmf(x, a, b, c, d) {
        // FLAT TOP FIRST — handles edge cases like c===d where x===c===d should return 1
        if (x >= b && x <= c) return 1;
        // Zero-membership edges
        if (x <= a || x >= d) return 0;
        // Slopes
        if (x > a && x < b) return (x - a) / (b - a);
        if (x > c && x < d) return (d - x) / (d - c);
        return 0;
    }

    // ─── Rule Base Generator (81 rules, weighted Mamdani) ───
    _generateRules() {
        const aS = ['Light', 'Packed', 'Overloaded'];
        const sS = ['Zombie', 'Functioning', 'WellRested'];
        const wS = ['Broke', 'Surviving', 'Stable'];
        const tS = ['Chilling', 'Concerned', 'Screaming'];
        const oS = ['AcademicVictim', 'DeepFried', 'Cooked', 'HangingInThere', 'Thriving'];

        const scoreMap = {
            assignmentLoad: { Light: 2, Packed: 0, Overloaded: -2 },
            sleepHours:     { Zombie: -2, Functioning: 0, WellRested: 2 },
            walletBalance:  { Broke: -1, Surviving: 0, Stable: 1 },
            stressLevel:    { Chilling: 2, Concerned: 0, Screaming: -2 }
        };

        function outputClass(score) {
            if (score >= 5) return 4; // Thriving
            if (score >= 2) return 3; // HangingInThere
            if (score >= -1) return 2; // Cooked
            if (score >= -4) return 1; // DeepFried
            return 0;                  // AcademicVictim
        }

        const rules = [];
        for (let ai = 0; ai < 3; ai++) {
            for (let si = 0; si < 3; si++) {
                for (let wi = 0; wi < 3; wi++) {
                    for (let ti = 0; ti < 3; ti++) {
                        const total = scoreMap.assignmentLoad[aS[ai]] +
                                      scoreMap.sleepHours[sS[si]] +
                                      scoreMap.walletBalance[wS[wi]] +
                                      scoreMap.stressLevel[tS[ti]];
                        const oi = outputClass(total);
                        rules.push({
                            antecedents: [
                                { var: 'assignmentLoad', set: aS[ai] },
                                { var: 'sleepHours',     set: sS[si] },
                                { var: 'walletBalance',  set: wS[wi] },
                                { var: 'stressLevel',    set: tS[ti] }
                            ],
                            consequent: { set: oS[oi], idx: oi }
                        });
                    }
                }
            }
        }
        return rules;
    }

    // ─── Fuzzification ───
    fuzzify(varName, value) {
        const def = this.inputDefs[varName];
        const result = {};
        for (const [name, params] of Object.entries(def.sets)) {
            result[name] = this.trapmf(value, ...params);
        }
        return result;
    }

    // ─── Full Mamdani Evaluation ───
    evaluate(inputs) {
        // Step 1: Fuzzification
        const fuzzified = {};
        for (const [varName, value] of Object.entries(inputs)) {
            fuzzified[varName] = this.fuzzify(varName, value);
        }

        // Step 2 & 3: Rule Evaluation (AND = min)
        const firingRules = [];
        for (const rule of this.rules) {
            let strength = 1;
            for (const ant of rule.antecedents) {
                const dom = fuzzified[ant.var][ant.set];
                strength = Math.min(strength, dom);
            }
            if (strength > 0.001) {
                firingRules.push({
                    ...rule,
                    strength: strength,
                    text: `IF ${rule.antecedents.map(a =>
                        a.var.replace(/([A-Z])/g, ' $1').trim() + ' is ' + a.set
                    ).join(' AND ')} THEN Score is ${rule.consequent.set.replace(/([A-Z])/g, ' $1').trim()}`
                });
            }
        }

        // Step 4: Aggregation (Mamdani Max)
        const aggregated = new Array(101).fill(0);
        for (const rule of firingRules) {
            const outParams = this.outputDef.sets[rule.consequent.set];
            for (let x = 0; x <= 100; x++) {
                const outDOM = this.trapmf(x, ...outParams);
                const clipped = Math.min(rule.strength, outDOM);
                aggregated[x] = Math.max(aggregated[x], clipped);
            }
        }

        // Step 5: Defuzzification (Centroid)
        let sum = 0, sumW = 0;
        for (let x = 0; x <= 100; x++) {
            sum += x * aggregated[x];
            sumW += aggregated[x];
        }
        const centroid = sumW > 0 ? sum / sumW : 50;

        // Step 6: Label
        let label = 'Cooked';
        if (centroid >= 85) label = 'Thriving';
        else if (centroid >= 65) label = 'Hanging In There';
        else if (centroid >= 45) label = 'Cooked';
        else if (centroid >= 20) label = 'Deep Fried';
        else label = 'Academic Victim';

        const steps = this._buildSteps(inputs, fuzzified, firingRules, aggregated, centroid);

        return {
            centroid, score: centroid, label, status: label,
            firingRules, activeRules: firingRules,
            aggregated, aggregatedOutput: aggregated,
            fuzzified, fuzzifiedInputs: fuzzified,
            steps
        };
    }

    _buildSteps(inputs, fuzzified, firingRules, aggregated, centroid) {
        const steps = [];
        // Fuzzification
        const fuzzRows = [];
        for (const [varName, value] of Object.entries(inputs)) {
            for (const [setName, params] of Object.entries(this.inputDefs[varName].sets)) {
                const dom = fuzzified[varName][setName];
                if (dom > 0.001) {
                    fuzzRows.push({
                        variable: varName.replace(/([A-Z])/g, ' $1').trim(),
                        value, set: setName, dom, params
                    });
                }
            }
        }
        steps.push({ title: '1. Fuzzification', type: 'fuzzification', rows: fuzzRows });

        // Rules
        const topRules = firingRules.sort((a, b) => b.strength - a.strength);
        steps.push({
            title: '2. Rule Evaluation (Mamdani Min)',
            type: 'rules', count: firingRules.length,
            topRules: topRules.slice(0, 15)
        });

        // Aggregation
        steps.push({
            title: '3. Aggregation (Mamdani Max)',
            type: 'aggregation', curve: aggregated,
            peakMembership: Math.max(...aggregated)
        });

        // Defuzzification
        let sumX = 0, sumMu = 0;
        for (let x = 0; x <= 100; x++) { sumX += x * aggregated[x]; sumMu += aggregated[x]; }
        steps.push({
            title: '4. Defuzzification (Centroid)',
            type: 'defuzz', centroid,
            formula: 'COG = E(x \u00b7 u(x)) / E(u(x))',
            calculation: `COG = ${sumX.toFixed(2)} / ${sumMu.toFixed(4)} = ${centroid.toFixed(2)}`,
            numerator: sumX, denominator: sumMu
        });

        return steps;
    }

    drawInputCharts(state) {}
    drawDefuzzChart(result) {}
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = FuzzyEngine;
} else {
    window.FuzzyEngine = FuzzyEngine;
}