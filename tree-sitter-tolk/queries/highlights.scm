"do" @keyword
"if" @keyword
"as" @keyword
"fun" @keyword
"asm" @keyword
"get" @keyword
"try" @keyword
"var" @keyword
"val" @keyword
"else" @keyword
"true" @keyword
"tolk" @keyword
"const" @keyword
"false" @keyword
"throw" @keyword
"redef" @keyword
"while" @keyword
"catch" @keyword
"return" @keyword
"assert" @keyword
"import" @keyword
"global" @keyword
"repeat" @keyword
"mutate" @keyword
(null_literal) @keyword
(builtin_specifier) @keyword

"=" @operator
"+=" @operator
"-=" @operator
"*=" @operator
"/=" @operator
"%=" @operator
"<<=" @operator
">>=" @operator
"&=" @operator
"|=" @operator
"^=" @operator

"==" @operator
"<" @operator
">" @operator
"<=" @operator
">=" @operator
"!=" @operator
"<=>" @operator
"<<" @operator
">>" @operator
"~>>" @operator
"^>>" @operator
"-" @operator
"+" @operator
"|" @operator
"^" @operator
"*" @operator
"/" @operator
"%" @operator
"~/" @operator
"^/" @operator
"&" @operator
"~" @operator
"." @operator
"!" @operator
"&&" @operator
"||" @operator

"->" @operator


(string_literal) @string
(number_literal) @number
(boolean_literal) @number

(annotation) @attribute

(function_declaration
  name: (identifier) @function)
(get_method_declaration
  name: (identifier) @function)
(function_call
  callee: (identifier) @function)
(function_call
  callee: (dot_access (identifier) (identifier) @function))
(dot_access
  field: (identifier) @variable)

(type_identifier) @type
(primitive_type) @type
(void_type) @type
(self_type) @type

(identifier) @variable

(comment) @comment
