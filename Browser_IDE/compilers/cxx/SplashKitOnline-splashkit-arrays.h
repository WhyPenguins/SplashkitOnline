

#ifndef splashkit_arrays_h
#define splashkit_arrays_h

namespace USERCODE{

#ifndef NO_BREAK
#define NO_BREAK
#endif


struct array_invalid_index {};


struct array_allocation_failed {};


struct array_invalid_size {};



template<typename T, int MAX_SIZE>
class fixed_array
{
    const int _size = MAX_SIZE;
    T data[MAX_SIZE];


    void check_index(int index, const std::string& access_type) const
    {NO_BREAK
        if (index < 0 || index >= _size)
        {
            if (_size == 0)
            {
                write_line("Cannot access index " + to_string(index) +
    " because array is empty.");
            }
            else
            {
                write_line("Index to " + access_type + " (" + to_string(index) + ") is outside of range 0 - " + to_string(_size - 1) + ".");
            }
            throw array_invalid_index();
        }
    }

    public:

    fixed_array() = default;


    explicit fixed_array(const T& initial_value)
    {NO_BREAK
        for(int i = 0; i < MAX_SIZE; i ++)
            data[i]  = initial_value;
    }


    fixed_array& operator=(const fixed_array& other)
    {NO_BREAK
        if (this != &other)
        {
            data = other.data;
        }
        return *this;
    }


    int length() const
    {NO_BREAK
        return _size;
    }


    T& get(int index)
    {NO_BREAK
        check_index(index, "access");
        return data[index];
    }


    const T& get(int index) const
    {NO_BREAK
        check_index(index, "access");
        return data[index];
    }


    void set(int index, const T& value)
    {NO_BREAK
        check_index(index, "set");
        data[index] = value;
    }


    void set(int index, T&& value)
    {NO_BREAK
        check_index(index, "set");
        data[index] = /*std::move*/(value);
    }


    void fill(const T& value)
    {NO_BREAK
        for (int i = 0; i < _size; ++i)
        {
            data[i] = value;
        }
    }


    bool try_get(int index, T& value) const
    {NO_BREAK
        if (index < 0 || index >= _size)
        {
            return false;
        }

        value = data[index];
        return true;
    }


    bool try_set(int index, const T& value)
    {NO_BREAK
        if (index < 0 || index >= _size)
        {
            return false;
        }

        data[index] = value;
        return true;
    }


    bool try_set(int index, T&& value)
    {NO_BREAK
        if (index < 0 || index >= _size)
        {
            return false;
        }

        data[index] = /*std::move*/(value);
        return true;
    }


    T& operator[](int index)
    {NO_BREAK
        return get(index);
    }


    const T& operator[](int index) const
    {NO_BREAK
        return get(index);
    }

};


template<typename T, int MAX_SIZE>
int length(const fixed_array<T, MAX_SIZE>& array)
{NO_BREAK
    return array.length();
}


template<typename T, int MAX_SIZE>
T& get(fixed_array<T, MAX_SIZE>& array, int index)
{NO_BREAK
    return array.get(index);
}



template<typename T, int MAX_SIZE>
const T& get(const fixed_array<T, MAX_SIZE>& array, int index)
{NO_BREAK
    return array.get(index);
}


template<typename T, int MAX_SIZE>
void fill(fixed_array<T, MAX_SIZE>& array, const T& value)
{NO_BREAK
    array.fill(value);
}


template<typename T, int MAX_SIZE, typename U>
void set(fixed_array<T, MAX_SIZE>& array, int index, U&& value)
{NO_BREAK
    array.set(index, std::forward<U>(value));
}


template<typename T, int MAX_SIZE>
bool try_get(const fixed_array<T, MAX_SIZE>& array, int index, T& value)
{NO_BREAK
    return array.try_get(index, value);
}


template<typename T, int MAX_SIZE, typename U>
bool try_set(fixed_array<T, MAX_SIZE>& array, int index, U&& value)
{NO_BREAK
    return array.try_set(index, std::forward<U>(value));
}





template<typename T>
class dynamic_array
{
    int size = 0;
    int _capacity = 0;
    T* data = nullptr;

    void check_index(int index, const std::string& access_type) const
    {NO_BREAK
        if (index < 0 || index >= size)
        {
            if (size == 0)
            {
                write_line("Cannot access index " + to_string(index) +
    " because array is empty.");
            }
            else
            {
                write_line("Index to " + access_type + " (" + to_string(index) + ") is outside of range 0 - " + to_string(size - 1) + ".");
            }
            throw array_invalid_index();
        }
    }


    void check_insert_index(int index) const
    {NO_BREAK
        if (index < 0 || index > size)
        {
            write_line("Index to insert (" + to_string(index) + ") is outside of range 0 - " + to_string(size) + ".");
            throw array_invalid_index();
        }
    }

    public:


    dynamic_array() = default;


    ~dynamic_array() = default;


    int capacity() const
    {NO_BREAK
        return capacity;
    }


    int length() const
    {NO_BREAK
        return size;
    }


    bool is_empty() const
    {NO_BREAK
        return size == 0;
    }


    T& get(int index)
    {NO_BREAK
        check_index(index, "access");
        return data[static_cast<size_t>(index)];
    }


    const T& get(int index) const
    {NO_BREAK
        check_index(index, "access");
        return data[static_cast<size_t>(index)];
    }


    void set(int index, const T& value)
    {NO_BREAK
        check_index(index, "set");
        data[static_cast<size_t>(index)] = value;
    }


    void set(int index, T&& value)
    {NO_BREAK
        check_index(index, "set");
        data[static_cast<size_t>(index)] = /*std::move*/(value);
    }


    void fill(const T& value)
    {NO_BREAK
        for (size_t i = 0; i < size; ++i)
        {
            data[i] = value;
        }
    }


    bool try_get(int index, T& value) const
    {NO_BREAK
        if (index < 0 || index >= size)
        {
            return false;
        }

        value = data[static_cast<size_t>(index)];
        return true;
    }


    bool try_set(int index, const T& value)
    {NO_BREAK
        if (index < 0 || index >= size)
        {
            return false;
        }

        data[static_cast<size_t>(index)] = value;
        return true;
    }


    bool try_set(int index, T&& value)
    {NO_BREAK
        if (index < 0 || index >= size)
        {
            return false;
        }

        data[static_cast<size_t>(index)] = /*std::move*/(value);
        return true;
    }


    T& operator[](int index)
    {NO_BREAK
        return get(index);
    }


    const T& operator[](int index) const
    {NO_BREAK
        return get(index);
    }


    void add(const T& value)
    {NO_BREAK
        try
        {
            __adjust_capacity(size+1);
            data[size] = value;
            size++;
        }
        catch(...)// (const std::bad_alloc& _)
        {
            throw array_allocation_failed();
        }
    }


    void add(T&& value)
    {NO_BREAK
        try
        {
            __adjust_capacity(size+1);
            data[size] = /*std::move*/(value);
            size++;
        }
        catch(...)// (const std::bad_alloc& _)
        {
            throw array_allocation_failed();
        }
    }


    void insert(int index, const T& value)
    {NO_BREAK
        check_insert_index(index);
        try
        {
            __adjust_capacity(size+1);
            for(int i = size; i > index; i --)
                data[i] = /*std::move*/(data[i-1]);
            data[index] = value;
        }
        catch(...)// (const std::bad_alloc& _)
        {
            throw array_allocation_failed();
        }
    }


    void insert(int index, T&& value)
    {NO_BREAK
        check_insert_index(index);
        try
        {
            __adjust_capacity(size+1);
            size ++;
            for(int i = size; i > index; i --)
                data[i] = /*std::move*/(data[i-1]);
            data[index] = /*std::move*/(value);
        }
        catch(...)// (const std::bad_alloc&)
        {
            throw array_allocation_failed();
        }
    }


    void remove(int index)
    {NO_BREAK
        check_index(index, "remove");
        for(int i = index; i < size-1; i ++)
          data[i] = /*std::move*/(data[i+1]);
        size --;
        __adjust_capacity(size);
    }


    void remove_at(int index)
    {NO_BREAK
        remove(index);
    }


    void clear()
    {NO_BREAK
        size = 0;
        delete [] data;
        data = nullptr;
    }

    // returns number of unitialized elements
    int __resize_capacity(int new_size)
    {NO_BREAK
        if (new_size == _capacity) return 0;

        if (data == nullptr) {
            data = new T[new_size];
            return new_size;
        }
        int to_copy2 = new_size < size ? new_size : size;
        #ifdef DEBUG_MODE
        data = __debug_resize(data, size, new_size);
        #else
        T* new_data = new T[new_size];
        for(int i = 0; i < to_copy2; i ++) {
            new_data[i] = /*std::move*/(data[i]);
        }
        delete [] data;
        data = new_data;
        #endif

        return new_size - to_copy2;
    }
    int __adjust_capacity(int min_capacity)
    {NO_BREAK
       // For now let's make the size exactly what it needs to be...
        return __resize_capacity(min_capacity);
    }


    void resize(int new_size)
    {NO_BREAK
        if (new_size < 0)
        {
            write_line("Invalid dynamic_array size (" + to_string(new_size) + "). Size must be 0 or greater.");
            throw array_invalid_size();
        }

        try
        {
            //resize(static_cast<size_t>(new_size));
            __adjust_capacity(new_size);
            size = new_size;
        }
        catch(...) //(const std::bad_alloc& _)
        {
            throw array_allocation_failed();
        }
    }


    void resize(int new_size, const T& value)
    {NO_BREAK
        if (new_size < 0)
        {
            write_line("Invalid dynamic_array size (" + to_string(new_size) + "). Size must be 0 or greater.");
            throw array_invalid_size();
        }

        try
        {
            int remaining = __adjust_capacity(new_size);
            size = new_size;
            for(int i = size - remaining; i  < size; i ++) {
                data[i] = value;
            }
        }
        catch(...)// (const std::bad_alloc& _)
        {
            throw array_allocation_failed();
        }
    }
};


template<typename T>
int capacity(const dynamic_array<T>& array)
{NO_BREAK
    return array.capacity();
}


template<typename T>
int length(const dynamic_array<T>& array)
{NO_BREAK
    return array.length();
}


template<typename T>
bool is_empty_array(const dynamic_array<T>& array)
{NO_BREAK
    return array.is_empty();
}


template<typename T>
T& get(dynamic_array<T>& array, int index)
{NO_BREAK
    return array.get(index);
}



template<typename T>
const T& get(const dynamic_array<T>& array, int index)
{NO_BREAK
    return array.get(index);
}


template<typename T>
void fill(dynamic_array<T>& array, const T& value)
{NO_BREAK
    array.fill(value);
}


template<typename T, typename U>
void set(dynamic_array<T>& array, int index, U&& value)
{NO_BREAK
    array.set(index, std::forward<U>(value));
}


template<typename T>
bool try_get(const dynamic_array<T>& array, int index, T& value)
{NO_BREAK
    return array.try_get(index, value);
}


template<typename T, typename U>
bool try_set(dynamic_array<T>& array, int index, U&& value)
{NO_BREAK
    return array.try_set(index, std::forward<U>(value));
}


template<typename T>
void add(dynamic_array<T>& array, T&& value)
{NO_BREAK
    array.add(std::forward<T>(value));
}

template<typename T, typename U>
void add(dynamic_array<T>& array, U&& value)
{NO_BREAK
    array.add(std::forward<U>(value));
}


template<typename T, typename U>
void insert(dynamic_array<T>& array, int index, U&& value)
{NO_BREAK
    array.insert(index, std::forward<U>(value));
}


template<typename T>
void remove(dynamic_array<T>& array, int index)
{NO_BREAK
    array.remove(index);
}


template<typename T>
void remove_at(dynamic_array<T>& array, int index)
{NO_BREAK
    array.remove_at(index);
}


template<typename T>
void clear(dynamic_array<T>& array)
{NO_BREAK
    array.clear();
}


template<typename T>
void resize(dynamic_array<T>& array, int new_size)
{NO_BREAK
    array.resize(new_size);
}


template<typename T>
void resize(dynamic_array<T>& array, int new_size, const T& value)
{NO_BREAK
    array.resize(new_size, value);
}


}/*USERCODE*/


#ifdef DEBUG_MODE
template<typename T,int MAX_SIZE>
REGISTER_TYPE_NAME(fixed_array<T,MAX_SIZE>)

template<typename T,int MAX_SIZE>
inline std::string emit_memory_record(const fixed_array<T,MAX_SIZE>& t){
    std::stringstream ss;
    //ss << emit_memory_record(t._size);
    ss << emit_memory_record(t.data);
    return ss.str();
}

template<typename T,int MAX_SIZE>
inline std::string emit_structure_record(std::string name, const fixed_array<T,MAX_SIZE>& t){
    /*return emit_structure_wrap(name, t, ""
        + emit_structure_record("_size", t._size)
+ emit_structure_record("data", t.data)
    );*/
    return emit_structure_record(name, t.data);
};




template<typename T>
REGISTER_TYPE_NAME(dynamic_array<T>)

template<typename T>
inline std::string emit_memory_record(const dynamic_array<T>& t){
    std::stringstream ss;
    ss << emit_memory_record(t.data);
    return ss.str();
}

template<typename T>
inline std::string emit_structure_record(std::string name, const dynamic_array<T>& t){
    return emit_structure_record(name, t.data);
};

#endif

#endif

