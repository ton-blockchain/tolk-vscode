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
  translation_unit: $ => repeat($._top_level_declaration),

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
    field('value', $.expression),
    ';'
  ),

  // ----------------------------------------------------------
  // functions and their body

  function_declaration: $ => seq(
    optional(field('annotations', $.annotation_list)),
    'fun',
    field('name', $.identifier),
    optional(field('genericsT', $.genericsT_list)),
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
      repeat($.expression),
      ')'
    ))
  ),
  annotation_name: $ => /\w+/,

  genericsT_list: $ => seq(
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
    optional(field('modifiers', 'mutate')),
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

  statement: $ => choice(
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
    field('assigned_val', $.expression),
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
    repeat($.statement),
    '}'
  ),

  return_statement: $ => seq(
    'return',
    optional(field('body', $.expression)),
    ';'
  ),

  repeat_statement: $ => seq(
    'repeat',
    '(',
    field('count', $.expression),
    ')',
    field('body', $.block_statement)
  ),

  if_statement: $ => seq(
    choice('if', 'ifnot'),
    $._if_statement_contents,
  ),
  _if_statement_contents: $ => seq(
    '(',
    field('condition', $.expression),
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
    field('condition', $.expression),
    ')',
    ';'
  ),

  while_statement: $ => seq(
    'while',
    '(',
    field('condition', $.expression),
    ')',
    field('body', $.block_statement)
  ),

  break_statement: $ => seq('break', ';'),
  continue_statement: $ => seq('continue', ';'),

  throw_statement: $ => seq(
    'throw',
    $.expression,   // excNo, (excNo), (excNo, arg); but (1,2,3) will be also acceptable
    ';'
  ),

  assert_statement: $ => seq(
    'assert',
    choice(
      seq('(', field('condition', $.expression), ')', 'throw', field('excNo', $.expression)),
      seq('(', field('condition', $.expression), ',', field('excNo', $.expression), ')')
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

  expression_statement: $ => seq($.expression, ';'),

  // ----------------------------------------------------------
  // expressions

  expression: $ => $._expr10,

  _expr10: $ => prec.right(10, seq(
    $._expr13,
    optional(choice(
      seq(
        choice('=', '+=', '-=', '*=', '/=', '%=', '<<=', '>>=', '&=', '|=', '^='),
        $._expr10
      ),
      seq(
        '?',
        $._expr10,
        ':',
        $._expr10
      )
    )),
  )),

  _expr13: $ => prec.left(13, seq(
    $._expr14,
    repeat(seq(
      choice('&&', '||'),
      $._expr14,
    ))
  )),

  _expr14: $ => prec.left(14, seq(
    $._expr15,
    repeat(seq(
      choice('&', '|', '^'),
      $._expr15,
    ))
  )),

  _expr15: $ => prec.left(15, seq(
    $._expr17,
    optional(seq(
      choice('==', '<', '>', '<=', '>=', '!=', '<=>'),
      $._expr17
    ))
  )),

  _expr17: $ => prec.left(17, seq(
    $._expr20,
    repeat(seq(
      choice('<<', '>>', '~>>', '^>>'),
      $._expr20
    ))
  )),

  _expr20: $ => prec.left(20, seq(
    $._expr30,
    repeat(seq(
      choice('-', '+'),
      $._expr30
    ))
  )),

  _expr30: $ => prec.left(30, seq(
    $._expr75,
    repeat(seq(
      choice('*', '/', '%', '~/', '^/'),
      $._expr75
    ))
  )),

  _expr75: $ => prec(75, choice(
    seq(choice('!', '~', '-', '+'), $._expr75),
    $._expr80
  )),

  _expr80: $ => prec.left(80, seq(
    $._expr90,
    repeat($.dot_method_call)
  )),
  dot_method_call: $ => seq(
    '.',
    field('method_name', $.identifier),
    field('arguments', $.argument_list)
  ),

  _expr90: $ => prec.left(90, choice(
    $._expr100,
    $.function_call
  )),
  function_call: $ => seq(
    field('called_f', $._expr100),
    field('arguments', $.argument_list)
  ),

  argument_list: $ => seq(
    '(',
    commaSep($.call_argument),
    ')'
  ),
  call_argument: $ => seq(
    optional('mutate'),
    field('expr', $.expression)
  ),

  _expr100: $ => prec(100, choice(
    $.parenthesized_expression,
    $.tensor_expression,
    $.tensor_square,
    $.number_literal,
    $.string_literal,
    $.boolean_literal,
    $.null_literal,
    $.underscore,
    $.identifier,
  )),
  parenthesized_expression: $ => seq('(', $.expression, ')'),
  tensor_expression: $ => choice(seq('(', ')'), seq('(', commaSep2($.expression), ')')),
  tensor_square: $ => seq('[', commaSep($.expression), ']'),

  // ----------------------------------------------------------
  // type system

  _type_hint: $ => choice(
    $._atomic_type,
    $.function_type,
  ),

  function_type: $ => prec.right(100, seq(
    field('lhs', $._atomic_type),
    '->',
    field('rhs', $._type_hint)
  )),

  _atomic_type: $ => choice(
    $.primitive_type,
    $.auto_type,
    $.void_type,
    $.bool_type,
    $.self_type,
    $.genericT_item,
    $.tensor_type,
    $.tuple_type,
    $.parenthesized_type
  ),

  primitive_type: $ => choice('int', 'cell', 'slice', 'builder', 'continuation', 'tuple'),
  auto_type: $ => 'auto',
  void_type: $ => 'void',
  bool_type: $ => 'bool',
  self_type: $ => 'self',

  parenthesized_type: $ => seq('(', $._type_hint, ')'),
  tensor_type: $ => choice(seq('(', ')'), seq('(', commaSep2($._type_hint), ')')),
  tuple_type: $ => seq('[', commaSep($._type_hint), ']'),

  genericT_item: $ => /[a-zA-Z_$][a-zA-Z0-9_$]*/,

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

  extras: $ => [
    /\s/,
    $.comment,
  ],

  word: $ => $.identifier,

  rules: TOLK_GRAMMAR,
});
