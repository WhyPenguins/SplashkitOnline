// Written by a human, tidied by GLM 5 :)
#pragma once

// ==========================================
// Section 1: Includes & Definitions
// ==========================================
#include "splashkit.h"
#include <iostream>
#include <sstream>
#include <type_traits>

// ==========================================
// Section 2: The "Necessary Evils"
// ==========================================
// This should tell you everything you need to know
// about how robust this all is :)
#define private public
#define class struct

using std::string;

// WASM Memory addresses are integers.
using MemoryAddress = int;

#define DEBUG_MODE

// ==========================================
// Section 3: Communication Bridge
// ==========================================
extern "C" {
    // The external function provided by the environment to pass messages out.
    void __output_debugger_message__(int line, MemoryAddress strPtr);
}

// Helper to send a string message to the debugger visualizer.
inline void send_debug_message(int line, std::string msg) {
    __output_debugger_message__(line, (MemoryAddress)msg.c_str());
}

// ==========================================
// Section 4: String & JSON Helpers
// ==========================================

// Converts primitive types (and pointers) to string representations.
template<typename T>
std::string to_json_value(T* t) {
    std::stringstream ss;
    ss << (MemoryAddress)t;
    return ss.str();
}

template<typename T>
std::string to_json_value(const T& t) {
    std::stringstream ss;
    ss << t;
    return ss.str();
}

// Special handling for strings to make them look nice in the visualizer.
inline std::string to_json_value(const std::string& t) {
    return "\"\\\"" + t + "\\\"\"";
}

inline std::string to_json_value(const char* t) {
    return "\"\\\"" + std::string(t) + "\\\"\"";
}

inline std::string to_json_value(char t) {
    return "\"'" + std::string(1, t) + "'\"";
}

inline std::string to_json_value(bool t) {
    return "\"" + std::string(t?"True":"False") + "\"";
}

// Helper to clean up JSON lists (removes trailing comma).
inline std::string trim_json_list(std::string in) {
    if (!in.empty() && in.back() == ',') {
        in.pop_back();
    }
    return in;
}

// ==========================================
// Section 5: Type Introspection
// ==========================================

// Note: REGISTER_TYPE_NAME is defined
// _before_ this file due to dependent typename
// lookup shenanigans. Search in cxxCompilerDebugPreprocess.js

REGISTER_TYPE_NAME(int)
REGISTER_TYPE_NAME(long int)
REGISTER_TYPE_NAME(short int)
REGISTER_TYPE_NAME(unsigned int)
REGISTER_TYPE_NAME(unsigned long int)
REGISTER_TYPE_NAME(unsigned short int)
REGISTER_TYPE_NAME(double)
REGISTER_TYPE_NAME(float)
REGISTER_TYPE_NAME(bool)
REGISTER_TYPE_NAME(char)
REGISTER_TYPE_NAME(unsigned char)
REGISTER_TYPE_NAME(signed char)
REGISTER_TYPE_NAME(string)

template<typename T, std::size_t N>
REGISTER_TYPE_NAME(std::array<T, N>)
///////////
// Thanks GLM 5!
// 1. The detection helper (The "Detector" idiom)
template <typename, typename = void>
struct has_specific_name : std::false_type {};

template <typename T>
struct has_specific_name<T, std::void_t<decltype(get_type_name_specific(std::declval<T>()))>>
    : std::true_type {};

// 2. Helper variable for convenience (optional, but standard in C++17)
template <typename T>
inline constexpr bool has_specific_name_v = has_specific_name<T>::value;
///////////


template <typename T>
std::string get_friendly_typename(const T& t);

// Helpers to get names of array types.
template<typename T, int size>
std::string get_type_name_array(const T(&address)[size]) {
    return get_type_name_specific(address[0]) + "[" + std::to_string(size) + "]";
}

template <typename T>
std::string get_typename_dynarray(const T* address, std::size_t size) {
    return get_friendly_typename(address[0]) + "[" + std::to_string(size) + "]";
}

// Helper to get names of pointer types.
template<typename T>
std::string get_type_name_ptr(const T* t) {
    return get_type_name_specific(*t) + "*";
}

// Specialization for void pointers.
template<>
inline std::string get_type_name_ptr<void>(const void*) {
    return "void*";
}

// Main dispatcher for type name resolution.
template <typename T>
std::string get_friendly_typename(const T& t) {
    if constexpr(std::is_pointer_v<std::remove_reference_t<T>>) {
        return get_type_name_ptr(t);
    } else if constexpr(std::is_array_v<std::remove_reference_t<T>>) {
        return get_type_name_array(t);
    }
    return get_type_name_specific(t);
}

// ==========================================
// Section 6: Memory & Structure Serialization
// ==========================================

// Outputs raw memory view (address + value + type).
template<typename T>
std::string emit_memory_record(const T& t) {
    std::stringstream ss;
    std::string type_info = ",\"type\":\"" + get_friendly_typename(t) + "\"";
    ss << "{\"address\":" << (MemoryAddress)(&t) << ",\"val\":" << to_json_value(t) << type_info << "},";
    return ss.str();
}

// Array handling.
template<typename T, int size>
std::string emit_memory_record(const T(&t)[size]);

template<typename T>
std::string emit_memory_dynarray(const T* t, std::size_t size) {
    std::stringstream ss;
    for (std::size_t i = 0; i < size; ++i) {
        ss << emit_memory_record(t[i]);
    }
    return ss.str();
}

template<typename T, int size>
std::string emit_memory_record(const T(&t)[size]) {
    return emit_memory_dynarray(&t[0], size);
}

template<typename T, std::size_t size>
std::string emit_memory_record(const std::array<T, size> &t) {
    return emit_memory_dynarray(&t[0], size);
}

// Outputs declaration's structured view (name, type, address, fields).
template<typename T>
inline std::string emit_structure_wrap(std::string name, const T& t, std::string fields) {
    std::stringstream ss;
    ss << "{\"name\":\"" << name << "\",";
    ss << "\"type\":\"" << get_friendly_typename(t) << "\",";
    ss << "\"address\":" << (MemoryAddress)(&t) << ",";
    ss << "\"is_array\":" << (std::is_array<T>::value ? "true" : "false");
    if (!fields.empty()) {
        ss << ",\"fields\":[" << trim_json_list(fields) << "]";
    }
    ss << "},";
    return ss.str();
}

template<typename T>
inline std::string emit_structure_wrap_dynarray(std::string name, const T* t, std::string fields, std::size_t size) {
    std::stringstream ss;
    ss << "{\"name\":\"" << name << "\",";
    ss << "\"type\":\"" << get_typename_dynarray(t, size) << "\",";
    ss << "\"address\":" << (MemoryAddress)(t) << ",";
    ss << "\"is_array\":true";
    if (!fields.empty()) {
        ss << ",\"fields\":[" << trim_json_list(fields) << "]";
    }
    ss << "},";
    return ss.str();
}

template<typename T>
inline std::string emit_structure_record(std::string name, const T& t) {
    return emit_structure_wrap(name, t, "");
}

template<typename T, int size>
inline std::string emit_structure_record(std::string name, const T(&t)[size]);

template<typename T>
inline std::string emit_structure_dynarray(std::string name, const T* t, int size) {
    std::string elements = "";
    for (std::size_t i = 0; i < size; ++i) {
        elements += emit_structure_record(std::to_string(i), t[i]);
    }
    return emit_structure_wrap_dynarray(name, t, elements, size);
}

template<typename T, int size>
inline std::string emit_structure_record(std::string name, const T(&t)[size]) {
    return emit_structure_dynarray(name, &t[0], size);
}

template<typename T, std::size_t size>
inline std::string emit_structure_record(std::string name, const std::array<T, size> &t) {
    return emit_structure_dynarray(name, &t[0], size);
}

// ==========================================
// Section 7: Core Debugging Infrastructure
// ==========================================

// Represents a slice of source code text.
struct SourceSpan {
    std::string* file;
    int start = 0;
    int end = 0;
    int charStart = 0;
    int charEnd = 0;
};

// Thanks ChatGPT! (A neat RAII scope guard implementation).
template<typename F>
struct ScopeGuard {
    F f;
    ScopeGuard(F&& func) : f(std::forward<F>(func)) {}
    ~ScopeGuard() { f(); }
};

template<typename F>
ScopeGuard<F> make_scope_guard(F&& f) {
    return ScopeGuard<F>(std::forward<F>(f));
}

#define NO_BREAK auto ___no_break__ = (___skip_counter___++, make_scope_guard([](){___skip_counter___--;}));

const int BREAK_YES = 1;
const int BREAK_NO = 0;
const int BREAK_NO_BUFFER = -1;
int ___skip_counter___ = 0;

// Constructs the JSON message payload for the visualizer.
inline std::string build_debug_event(SourceSpan loc, std::string event, std::string structure, std::string value, bool break_execution = true) {
    int break_value = break_execution ? BREAK_YES : BREAK_NO;
    if (___skip_counter___ > 0)
        break_value = BREAK_NO_BUFFER;

    return "{\"event\":\"" + event + "\",\"file\":\"" + (*loc.file) + "\",\"line\":" + to_json_value(loc.start) +
        ",\"charStart\":" + to_json_value(loc.charStart) + ",\"charEnd\":" + to_json_value(loc.charEnd) +
        ",\"structure\":" + trim_json_list(structure) +
        ", \"val\":[" + trim_json_list(value) + "]" +
        ", \"break\": " + (break_value?"1":"0") + "}";
}

// Some types get initialized such that if a single member
// is initialized, the entire thing is. This includes aggregates,
// but also arrays, fundamental types, pointers, etc.
// These types also share the inability to observe the individual members
// being assigned, since the construction itself isn't in the source code.
template<typename T>
bool is_one_for_all_type() {
    return (std::is_aggregate<T>::value || std::is_fundamental<T>::value || std::is_pointer<T>::value || std::is_reference<T>::value || std::is_array<T>::value || std::is_same<T, std::string>::value);
}

// ==========================================
// Section 8: Variable & Expression Hooks
// ==========================================

// Hook for expressions.
template<typename F>
decltype(auto) trace_expression(SourceSpan loc, bool inner, F&& func) {
    if constexpr (std::is_same<decltype(std::forward<F>(func)()), void>::value) {
        std::forward<F>(func)();

        send_debug_message(loc.start, build_debug_event(loc, inner?"EXPRINNER":"EXPR", "null", ""));

        return;
    } else {
        decltype(auto) x = std::forward<F>(func)();

        send_debug_message(loc.start, build_debug_event(loc, inner?"EXPRINNER":"EXPR", "null", ""));
        // TODO: Could have a "current expression viewer?"
        // Will need to output the value then
        return x;
    }
}

inline void __break(SourceSpan loc) {
    send_debug_message(loc.start, build_debug_event(loc, "BREAK", "null", ""));
}
inline void __highlight(SourceSpan loc) {
    send_debug_message(loc.start, build_debug_event(loc, "HIGHLIGHT", "null", "", false));
}

// Hook for assignments.
template<typename T, typename F>
decltype(auto) trace_assignment(SourceSpan loc, T& t, std::string name, F&& func) {
    if constexpr (std::is_same<decltype(std::forward<F>(func)(t)), void>::value) {
        std::forward<F>(func)(t);

        if constexpr (has_specific_name_v<T>) {
            send_debug_message(loc.start, build_debug_event(loc, "ASSIGN", "null", emit_memory_record(t)));
        } else {
            send_debug_message(loc.start, build_debug_event(loc, "BREAK", "null", ""));
        }

        return;
    } else {
        decltype(auto) x = std::forward<F>(func)(t);
        if constexpr (has_specific_name_v<T>) {
            send_debug_message(loc.start, build_debug_event(loc, "ASSIGN", "null", emit_memory_record(t)));
        } else {
            send_debug_message(loc.start, build_debug_event(loc, "BREAK", "null", ""));
        }
        return x;
    }
}

// ==========================================
// Section 9: Scope & Stack Tracking
// ==========================================

// RAII object to track stack variable lifecycle and scope entry/exit.
template<bool isMain>
struct ScopedVariableTracker {
    void* alloc;

    template<typename T>
    void allocateAndConstruct(SourceSpan loc, std::string name, const T& x, bool isInitialized, bool _break) {
        bool outputMemory = false;
        alloc = (void*)&x;
        send_debug_message(loc.start, build_debug_event(loc, "DECL", emit_structure_record(name, x), (isInitialized && is_one_for_all_type<T>()) ? "\"PreventUpdate\"" : "", _break));
    }

    template<typename T>
    void postConstruct(SourceSpan loc, const T& x) {
        if (is_one_for_all_type<T>())
            send_debug_message(loc.start, build_debug_event(loc, "ASSIGN", "null", emit_memory_record(x)));
    }

    ~ScopedVariableTracker() {
        if (!isMain)
            send_debug_message(-1, build_debug_event({}, "DESTRUCT", "null", std::to_string((MemoryAddress)alloc), false));
    }
};

struct ScopeExitLogger {
    SourceSpan end_loc;
    ScopeExitLogger(SourceSpan start_loc, SourceSpan e) : end_loc(e) {
        send_debug_message(start_loc.start, build_debug_event(start_loc, "BREAK", "null", ""));
    }
    ~ScopeExitLogger() {
        send_debug_message(end_loc.start, build_debug_event(end_loc, "BREAK", "null", ""));
    }
};

// This is used as a hack to pause before entering functions
// that we can step into. We store a flag, the retroactively
// "break" at the position we were at before stepping.
// We then rely on destruction at the end of the full expression
// to reset the flag.
inline bool __debug__do_next_pause;
inline SourceSpan __debug__next_pause_loc;
inline void __handle_debug_forced_break() {
    if (!__debug__do_next_pause)
        return;

    __debug__do_next_pause = false;
    __break(__debug__next_pause_loc);
}

struct FunctionCallPauseHack {
    FunctionCallPauseHack(SourceSpan loc) {
        __debug__do_next_pause = true;
        __debug__next_pause_loc = loc;
        __highlight(loc);
    }
    ~FunctionCallPauseHack() {
        __debug__do_next_pause = false;
    }
};

// ==========================================
// Section 10: Heap Allocation Hooks
// ==========================================

// unused, but was helpful when debugging the debugger
// could be a useful visualization in the future?
static void* g_last_manual_allocation;

template<typename T>
void* trace_raw_allocation(SourceSpan loc) {
    void* x = ::operator new(sizeof(T));
    g_last_manual_allocation = x;
    send_debug_message(loc.start, build_debug_event(loc, "DECL", emit_structure_record("HEAP", *(T*)x), (is_one_for_all_type<T>()) ? "\"PreventUpdate\"" : ""));
    return x;
}

template<typename T, typename F>
T* trace_array_allocation(SourceSpan loc, std::size_t size, F func, bool isInitialized) {
    void* x = ::operator new[](sizeof(T) * size);
    g_last_manual_allocation = x;
    send_debug_message(loc.start, build_debug_event(loc, "DECL", emit_structure_dynarray("HEAP", (T*)x, size), (isInitialized && is_one_for_all_type<T>()) ? "\"PreventUpdate\"" : ""));

    T* res = func(x, size);

    if (isInitialized && is_one_for_all_type<T>())
        send_debug_message(loc.start, build_debug_event(loc, "ASSIGN", "null", emit_memory_dynarray(res, size)));

    return res;
}

template<typename T>
T* finalize_heap_construction(SourceSpan loc, T* x) {
    if (is_one_for_all_type<T>())
        send_debug_message(loc.start, build_debug_event(loc, "ASSIGN", "null", emit_memory_record(*x)));
    return x;
}

template<typename T>
void trace_deallocation(SourceSpan loc, T* x) {
    send_debug_message(loc.start, build_debug_event(loc, "BREAK", "null", ""));
    delete x;
    send_debug_message(loc.start, build_debug_event(loc, "DESTRUCT", "null", std::to_string((MemoryAddress)x)));
}

template<typename T>
T* __debug_resize(T* data, int size, int new_size) {
    int to_copy = new_size < size ? new_size : size;
    T* new_data = new T[new_size]{};
    for(int i = 0; i < to_copy; i ++) {
        new_data[i] = std::move(data[i]);
    }
    delete [] data;

    send_debug_message(-1, build_debug_event({}, "REMAP", emit_structure_dynarray("HEAP", new_data, new_size), std::to_string((MemoryAddress)data), false));

    return new_data;
}

// ==========================================
// Section 11: Injection Macros
// ==========================================

// Expression & Assignment Hooks
#define __TRACE_EXPRESSION(loc, inner, ...) trace_expression(loc, inner, [&]() -> decltype(auto) {return __VA_ARGS__;})

#define __TRACE_ASSIGNMENT(loc, to, op, ...) \
trace_assignment(loc, (to), #to, [&](auto& __x__) -> decltype(auto) {return __x__ op __VA_ARGS__;})

#define __TRACE_ASSIGNMENT_PRE(loc, op, to) \
trace_assignment(loc, (to), #to, [&](auto& __x__) -> decltype(auto) {return op __x__;})

// Scope Tracking Hooks
#define __SCOPED_VARIABLE_TRACKER(name, isMain) \
ScopedVariableTracker<isMain> name##_____debug;

#define __SCOPE_TRACKER(start, end) \
ScopeExitLogger ___debug_scope_exit____{start, end};

#define __TRACE_STACK_DECL_INIT(loc, name) \
name##_____debug.allocateAndConstruct(loc, #name, name, true, true)

#define __TRACE_STACK_DECL_INIT_NOBREAK(loc, name) \
name##_____debug.allocateAndConstruct(loc, #name, name, true, false)

#define __TRACE_STACK_DECL_NO_INIT(loc, name) \
name##_____debug.allocateAndConstruct(loc, #name, name, false, true)

#define __TRACE_POST_CONSTRUCTION(loc, name) \
(name##_____debug.postConstruct(loc, name), nullptr)

// Heap Hooks
#define __TRACE_NEW_ARRAY(loc, isInitialized, new_kw, _type, typeStart, expr, typeEndAndCons) \
trace_array_allocation<typename std::remove_pointer<_type>::type>(loc, (expr), [&](void* ___construct_addr___, std::size_t ___array_size___) {\
    return new_kw(___construct_addr___)typeStart (___array_size___) typeEndAndCons;\
}, isInitialized)

#define __TRACE_DELETE(loc, delete_kw, expr) \
trace_deallocation(loc, expr)
