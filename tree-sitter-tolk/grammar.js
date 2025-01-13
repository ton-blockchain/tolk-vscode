// It's a main grammar description, `tree-sitter generate` works based on this file.
// This grammar describes the latest version of the Tolk language for TON Blockchain.

function commaSep(rule) {
  return optional(commaSep1(rule))
}

function commaSep1(rule) {
  return seq(rule, repeat(seq(',', rule)))
}

function commaSep2(rule) {
  return seq(rule, repeat1(seq(',', rule)))
}

const TOLK_GRAMMAR = {
  source_file: $ => repeat($._top_level_declaration),

  // ----------------------------------------------------------
  // top-level declarations

  _top_level_declaration: $ => choice(
    $.tolk_required_version,
    $.import_directive,
    $.global_var_declaration,
    $.constant_declaration,
    $.function_declaration,
    $.get_method_declaration,
    $.empty_statement,
  ),

  tolk_required_version: $ => seq(
    'tolk',
    field('value', $.version_value)
  ),
  version_value: $ => /(\d+)(.\d+)?(.\d+)?/,

  import_directive: $ => seq(
    'import',
    field('path', $.string_literal)
  ),

  global_var_declaration: $ => seq(
    'global',
    field('name', $.identifier),
    ':',
    field('type', $._type_hint),
    ';'
  ),

  constant_declaration: $ => seq(
    'const',
    field('name', $.identifier),
    optional(seq(
      ':',
      field('type', $._type_hint),
    )),
    '=',
    field('value', $._expression),
    ';'
  ),

  // ----------------------------------------------------------
  // functions and their body

  function_declaration: $ => seq(
    optional(field('annotations', $.annotation_list)),
    'fun',
    field('name', $.identifier),
    optional(field('genericTs', $.genericT_list)),
    field('parameters', $.parameter_list),
    optional(seq(
      ':',
      field('return_type', optional($._type_hint)),
    )),
    choice(
      field('body', $.block_statement),
      field('asm_body', $.asm_body),
      field('builtin_specifier', $.builtin_specifier)
    )
  ),
  get_method_declaration: $ => seq(
    optional(field('annotations', $.annotation_list)),
    'get',
    optional('fun'),
    field('name', $.identifier),
    field('parameters', $.parameter_list),
    optional(seq(
      ':',
      field('return_type', optional($._type_hint)),
    )),
    field('body', $.block_statement)
  ),

  annotation_list: $ => repeat1($.annotation),
  annotation: $ => seq(
    '@',
    field('name', $.annotation_name),
    optional(seq(
      '(',
      repeat($._expression),
      ')'
    ))
  ),
  annotation_name: $ => /\w+/,

  genericT_list: $ => seq(
    '<',
    commaSep($.identifier),
    '>'
  ),

  parameter_list: $ => seq(
    '(',
    commaSep($.parameter_declaration),
    ')'
  ),
  parameter_declaration: $ => seq(
    optional('mutate'),
    field('name', $.identifier),
    optional(seq(
      ':',
      field('type', $._type_hint)
    ))
  ),

  asm_body: $ => seq(
    'asm',
    optional(seq(
      '(',
      repeat($.identifier),
      optional(seq(
        '->',
        repeat($.number_literal)
      )),
      ')'
    )),
    repeat1($.string_literal),
    ';'
  ),

  builtin_specifier: $ => 'builtin',

  // ----------------------------------------------------------
  // statements

  _statement: $ => choice(
    $.local_vars_declaration,
    $.block_statement,
    $.return_statement,
    $.if_statement,
    $.repeat_statement,
    $.do_while_statement,
    $.while_statement,
    $.break_statement,
    $.continue_statement,
    $.throw_statement,
    $.assert_statement,
    $.try_catch_statement,
    $.empty_statement,
    $.expression_statement,
  ),

  local_vars_declaration: $ => seq(
    choice('var', 'val'),
    field('lhs', $.var_declaration_lhs),
    '=',
    field('assigned_val', $._expression),
    ';'
  ),
  var_declaration_lhs: $ => choice(
    seq('(', commaSep1($.var_declaration_lhs), ')'),
    seq('[', commaSep1($.var_declaration_lhs), ']'),
    seq(
      field('name', $.identifier),
      optional(choice(
        seq(':', field('type', $._type_hint)),
        'redef'
      ))
    )
  ),

  block_statement: $ => seq(
    '{',
    repeat($._statement),
    '}'
  ),

  return_statement: $ => seq(
    'return',
    optional(field('body', $._expression)),
    ';'
  ),

  repeat_statement: $ => seq(
    'repeat',
    '(',
    field('count', $._expression),
    ')',
    field('body', $.block_statement)
  ),

  if_statement: $ => seq(
    'if',
    '(',
    field('condition', $._expression),
    ')',
    field('body', $.block_statement),
    field('alternative', optional(choice(
      seq('else', $.if_statement),
      seq('else', $.block_statement)
    )))
  ),

  do_while_statement: $ => seq(
    'do',
    field('body', $.block_statement),
    'while',
    '(',
    field('condition', $._expression),
    ')',
    ';'
  ),

  while_statement: $ => seq(
    'while',
    '(',
    field('condition', $._expression),
    ')',
    field('body', $.block_statement)
  ),

  break_statement: $ => seq('break', ';'),
  continue_statement: $ => seq('continue', ';'),

  throw_statement: $ => seq(
    'throw',
    $._expression,   // excNo, (excNo), (excNo, arg); but (1,2,3) will be also acceptable
    ';'
  ),

  assert_statement: $ => seq(
    'assert',
    choice(
      seq('(', field('condition', $._expression), ')', 'throw', field('excNo', $._expression)),
      seq('(', field('condition', $._expression), ',', field('excNo', $._expression), ')')
    ),
    ';'
  ),

  try_catch_statement: $ => seq(
    'try',
    field('try_body', $.block_statement),
    'catch',
    optional(seq(
      '(',
      field('catch_var1', $.identifier),
      optional(seq(
        ',',
        field('catch_var2', $.identifier)
      )),
      ')'
    )),
    field('catch_body', $.block_statement)
  ),

  empty_statement: $ => ';',

  expression_statement: $ => seq($._expression, ';'),

  // ----------------------------------------------------------
  // expressions

  _expression: $ => choice(
    $.assignment,
    $.set_assignment,
    $.ternary_operator,
    $.binary_operator,
    $.unary_operator,
    $.cast_as_operator,
    $.dot_access,
    $.function_call,
    $.generic_instantiation,
    $.parenthesized_expression,
    $.tensor_expression,
    $.typed_tuple,
    $.number_literal,
    $.string_literal,
    $.boolean_literal,
    $.null_literal,
    $.underscore,
    $.identifier,
  ),

  assignment: $ => prec.right(10, seq(
    $._expression,
    '=',
    $._expression
  )),

  set_assignment: $ => prec.right(10, seq(
    $._expression,
    field('operator_name', choice('+=', '-=', '*=', '/=', '%=', '<<=', '>>=', '&=', '|=', '^=')),
    $._expression
  )),

  ternary_operator: $ => prec.right(10, seq(
    $._expression,
    '?',
    $._expression,
    ':',
    $._expression
  )),

  _brackets_lt_gt: _ => choice("<", ">"),   // extracted specially to resolve conflicts between `<` and `f<int>`
  _comparison_lt_gt: $ => prec.left(15, seq($._expression, field('operator_name', $._brackets_lt_gt), $._expression)),

  binary_operator: $ => choice(
    prec.left(13, seq($._expression, field('operator_name', choice('&&', '||')), $._expression)),
    prec.left(14, seq($._expression, field('operator_name', choice('&', '|', '^')), $._expression)),
    prec.left(15, seq($._expression, field('operator_name', choice('==', '!=', '<=', '>=', '<=>')), $._expression)),
    $._comparison_lt_gt,
    prec.left(17, seq($._expression, field('operator_name', choice('<<', '>>', '~>>', '^>>')), $._expression)),
    prec.left(20, seq($._expression, field('operator_name', choice('-', '+')), $._expression)),
    prec.left(30, seq($._expression, field('operator_name', choice('*', '/', '%', '~/', '^/')), $._expression)),
  ),

  unary_operator: $ => choice(
    prec.left(75, seq(field('operator_name', choice('!', '~', '-', '+')), $._expression)),
  ),

  cast_as_operator: $ => prec(40, seq(
    $._expression,
    'as',
    field('casted_to', $._type_hint)
  )),

  dot_access: $ => prec(80, seq(
    field('obj', $._expression),
    '.',
    field('field', $.identifier)    // for method call, dot_access is wrapped into function_call, "field" actually means method name
  )),

  function_call: $ => prec.left(90, seq(
    field('callee', $._expression), // callee can be generic_instantiation or dot_access
    field('arguments', $.argument_list)
  )),
  argument_list: $ => seq(
    '(',
    commaSep($.call_argument),
    ')'
  ),
  call_argument: $ => seq(
    optional('mutate'),
    field('expr', $._expression)
  ),

  generic_instantiation: $ => prec(10, seq(
    field('expr', $._expression),
    field('instantiationTs', $.instantiationT_list)
  )),
  instantiationT_list: $ => prec.dynamic(1, seq(  // prec.dynamic is important
    '<',
    commaSep1($._type_hint),
    '>'
  )),

  parenthesized_expression: $ => seq('(', $._expression, ')'),
  tensor_expression: $ => choice(seq('(', ')'), seq('(', commaSep2($._expression), ')')),
  typed_tuple: $ => seq('[', commaSep($._expression), ']'),

  // ----------------------------------------------------------
  // type system

  _type_hint: $ => choice(
    $.primitive_type,
    $.void_type,
    $.self_type,
    alias($.identifier, $.type_identifier),
    $.tensor_type,
    $.tuple_type,
    $.parenthesized_type,
    $.fun_callable_type,
  ),

  primitive_type: $ => prec(2, choice('int', 'bool', 'cell', 'slice', 'builder', 'continuation', 'tuple')),
  void_type: $ => prec(2, 'void'),
  self_type: $ => prec(2, 'self'),

  tensor_type: $ => prec(2, choice(seq('(', ')'), seq('(', commaSep2($._type_hint), ')'))),
  tuple_type: $ => prec(2, seq('[', commaSep($._type_hint), ']')),
  parenthesized_type: $ => prec(2, seq('(', $._type_hint, ')')),

  fun_callable_type: $ => prec.right(1, seq(field('param_types', $._type_hint), '->', field('return_type', $._type_hint))),

  // ----------------------------------------------------------
  // common constructions

  number_literal: $ => token(choice(
    seq('0x', /[0-9a-fA-F]+/),
    /[0-9]+/
  )),
  string_literal: $ => /"[^"]*"\w?/,
  boolean_literal: $ => choice('true', 'false'),
  null_literal: $ => 'null',
  underscore: $ => '_',
  identifier: $ => /`[^`]+`|[a-zA-Z$_][a-zA-Z0-9$_]*/,

  // http://stackoverflow.com/questions/13014947/regex-to-match-a-c-style-multiline-comment/36328890#36328890
  comment: $ => token(choice(
    seq('//', /[^\r\n]*/),
    seq('/*', /[^*]*\*+([^/*][^*]*\*+)*/, '/'),
  )),
}

module.exports = grammar({
  name: 'tolk',

  conflicts: $ => [
    [$.instantiationT_list, $._brackets_lt_gt],
    [$._comparison_lt_gt, $.binary_operator, $.generic_instantiation],
  ],

  extras: $ => [
    /\s/,
    $.comment,
  ],

  word: $ => $.identifier,

  rules: TOLK_GRAMMAR,
});
